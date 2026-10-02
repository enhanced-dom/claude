// One-shot installer: copies the template files that ship alongside this
// compiled file (see src/devcontainer, shipped to dist/devcontainer by
// postbuild) into the .devcontainer/ folder of the project this package is
// installed in.

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { fileURLToPath } from 'url'

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url))
const TARGET_DIR = path.join(process.cwd(), '.devcontainer')
const EXECUTABLE = new Set(['init-firewall.sh', 'fix-host-docker-internal.sh', 'fix-node-modules-perms.sh', 'setup-node.sh'])
// listed explicitly (not readdirSync(SOURCE_DIR)) because the compiled
// index.js/index.d.ts also live in this directory and must not be copied
const TEMPLATE_FILES = ['devcontainer.json', 'Dockerfile', ...EXECUTABLE]

// ponytail: "has its own package.json" is the workspace heuristic (works for
// npm/yarn/pnpm workspaces alike) instead of parsing each tool's workspace config
const SKIP_DIRS = new Set(['node_modules', '.git', '.devcontainer', 'dist', 'build', 'coverage'])

const findPackageDirs = (dir: string, depth = 3): string[] => {
  const found = fs.existsSync(path.join(dir, 'package.json')) ? [dir] : []
  if (depth === 0) return found
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
      found.push(...findPackageDirs(path.join(dir, entry.name), depth - 1))
    }
  }
  return found
}

const ENV_FILE = /^\.env(\..+)?$/

const findEnvFiles = (dir: string, depth = 3): string[] => {
  const found: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && ENV_FILE.test(entry.name)) {
      found.push(path.join(dir, entry.name))
    } else if (depth > 0 && entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
      found.push(...findEnvFiles(path.join(dir, entry.name), depth - 1))
    }
  }
  return found
}

// blanks every .env found (root and subfolders) so container builds never see host secrets
const envMounts = (root: string) =>
  findEnvFiles(root).map((envPath) => {
    const rel = path.relative(root, envPath).split(path.sep).join('/')
    return `source=/dev/null,target=/workspace/${rel},type=bind`
  })

// Docker local-volume names must start with an alphanumeric char (regex
// [a-zA-Z0-9][a-zA-Z0-9_.-]*) — a scoped package name like "@foo/bar"
// sanitizes to a leading "-" otherwise, which docker rejects outright.
const volumeSlug = (root: string) => {
  let projectName = path.basename(root)
  try {
    projectName = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name ?? projectName
  } catch {
    // no root package.json, fall back to the folder name
  }
  return projectName.replace(/[^a-zA-Z0-9-]/g, '-').replace(/^[^a-zA-Z0-9]+/, '')
}

const nodeModulesMounts = (root: string) => {
  const slug = volumeSlug(root)
  return findPackageDirs(root).map((dir) => {
    const rel = path.relative(root, dir).split(path.sep).join('/')
    const target = rel ? `/workspace/${rel}/node_modules` : '/workspace/node_modules'
    const suffix = rel ? rel.replace(/\//g, '-') : 'root'
    return `source=${slug}-node-modules-${suffix},target=${target},type=volume`
  })
}

// code-review-graph's installer creates a project-root .venv on the host
// (see src/code-review-graph/index.ts). Left bind-mounted, that .venv's
// platform-specific binaries (e.g. macOS Mach-O python/pip) get exec'd
// inside the Linux container and fail with no readable error. Give it its
// own volume, same as node_modules, so the container gets its own venv.
const venvMount = (root: string) => `source=${volumeSlug(root)}-venv-root,target=/workspace/.venv,type=volume`

// Only the project root gets bind-mounted into the container. A dependency
// pinned to a local path outside it (e.g. "@enhanced-dom/lint":
// "/Users/x/enhanced-dom/lint/dist/foo.tgz") resolves fine on the host but
// is ENOENT inside the container unless that path is mounted too — so mount
// the containing directory of every such local-path dependency we find.
const LOCAL_DEP_PATH = /^(?:file:)?(\/|\.\.?\/|~\/)/

const localDependencyMounts = (root: string) => {
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {}
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  } catch {
    return []
  }

  const specs = [...Object.values(pkg.dependencies ?? {}), ...Object.values(pkg.devDependencies ?? {})]

  const dirs = new Set<string>()
  for (const spec of specs) {
    if (!LOCAL_DEP_PATH.test(spec)) continue
    const raw = spec.replace(/^file:/, '').replace(/^~(?=\/|$)/, os.homedir())
    const abs = path.isAbsolute(raw) ? raw : path.resolve(root, raw)
    if (abs === root || abs.startsWith(root + path.sep)) continue // already covered by the workspace mount
    if (!fs.existsSync(abs)) continue
    dirs.add(fs.statSync(abs).isDirectory() ? abs : path.dirname(abs))
  }

  return [...dirs].map((dir) => `source=${dir},target=${dir},type=bind,readonly`)
}

export const install = ({ force }: { force: boolean }) => {
  fs.mkdirSync(TARGET_DIR, { recursive: true })

  for (const name of TEMPLATE_FILES) {
    const filePath = path.join(TARGET_DIR, name)
    if (fs.existsSync(filePath) && !force) {
      console.log(`Skipping ${name} (already exists, use --force to overwrite)`)
      continue
    }
    if (name === 'devcontainer.json') {
      const config = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, name), 'utf8'))
      config.mounts = config.mounts.filter((mount: string) => !mount.includes('target=/workspace/.env'))
      config.mounts.push(
        ...envMounts(process.cwd()),
        ...nodeModulesMounts(process.cwd()),
        venvMount(process.cwd()),
        ...localDependencyMounts(process.cwd()),
      )
      fs.writeFileSync(filePath, JSON.stringify(config, null, 4) + '\n')
    } else {
      fs.copyFileSync(path.join(SOURCE_DIR, name), filePath)
    }
    if (EXECUTABLE.has(name)) fs.chmodSync(filePath, 0o755)
    console.log(`Wrote ${path.join('.devcontainer', name)}`)
  }

  console.log('\nDone. Open this project in VS Code and "Reopen in Container".')
}
