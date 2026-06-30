#!/usr/bin/env bash
#
# release.sh — build, tag and push the app-bookmarks images to GHCR.
#
# Builds the `api` and `frontend` images, tags each with a version AND `latest`,
# and (by default) pushes a multi-arch manifest (amd64 + arm64) so the images
# pull on both Apple Silicon and x86 hosts.
#
# Usage:
#   ./release.sh                  # version each image from its own package.json
#   ./release.sh 1.2.3            # force this version for both images
#   ./release.sh --sha            # version = git short SHA (immutable, traceable)
#   ./release.sh --tag            # version = `git describe --tags`
#   ./release.sh api 1.2.3        # only the api image, at 1.2.3
#   ./release.sh frontend         # only the frontend image, from its package.json
#   ./release.sh --no-push        # build locally only (single-arch, loads into docker)
#   ./release.sh --no-latest      # push the version tag only, don't move `latest`
#   ./release.sh --platforms linux/amd64   # override target platforms
#
# Auth: pushing needs `docker login ghcr.io` with a PAT that has `write:packages`.
#
set -euo pipefail

# ── config ──────────────────────────────────────────────────────────────────
REGISTRY="ghcr.io"
OWNER="marcoguastalli"
PROJECT="app-bookmarks"                 # image prefix → app-bookmarks-<component>
PLATFORMS="linux/amd64,linux/arm64"
ALL_COMPONENTS=(api frontend)           # <dir> == <component>; image: app-bookmarks-<dir>

# ── locate repo root (script lives at the repo root) ────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ── parse args ──────────────────────────────────────────────────────────────
PUSH=true
TAG_LATEST=true
VERSION=""                              # empty => derive per-component from package.json
VERSION_MODE="package"                  # package | explicit | sha | tag
COMPONENTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-push)    PUSH=false ;;
    --no-latest)  TAG_LATEST=false ;;
    --sha)        VERSION_MODE="sha" ;;
    --tag)        VERSION_MODE="tag" ;;
    --platforms)  PLATFORMS="${2:?--platforms needs a value}"; shift ;;
    api|frontend) COMPONENTS+=("$1") ;;
    -h|--help)    sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//; /^set -euo/d'; exit 0 ;;
    *)
      if [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.+].*)?$ ]]; then
        VERSION="$1"; VERSION_MODE="explicit"
      else
        echo "release.sh: unrecognized argument '$1' (try --help)" >&2; exit 2
      fi
      ;;
  esac
  shift
done

[[ ${#COMPONENTS[@]} -eq 0 ]] && COMPONENTS=("${ALL_COMPONENTS[@]}")

# ── resolve the version string for a given component ────────────────────────
resolve_version() {
  local component="$1"
  case "$VERSION_MODE" in
    explicit) printf '%s' "$VERSION" ;;
    sha)      git -C "$ROOT" rev-parse --short HEAD ;;
    tag)      git -C "$ROOT" describe --tags --always ;;
    package)  node -p "require('./$component/package.json').version" ;;
  esac
}

# ── pre-flight ──────────────────────────────────────────────────────────────
command -v docker >/dev/null || { echo "release.sh: docker not found" >&2; exit 1; }

if $PUSH; then
  # buildx multi-arch push needs a builder that supports it; create one if needed.
  if ! docker buildx inspect bookmarks-builder >/dev/null 2>&1; then
    echo "→ creating buildx builder 'bookmarks-builder'"
    docker buildx create --name bookmarks-builder --driver docker-container --bootstrap >/dev/null
  fi
  docker buildx use bookmarks-builder
  if ! grep -q "$REGISTRY" "${DOCKER_CONFIG:-$HOME/.docker}/config.json" 2>/dev/null; then
    echo "⚠  Not logged in to $REGISTRY. Run:" >&2
    echo "     echo \$PAT | docker login $REGISTRY -u $OWNER --password-stdin   # PAT needs write:packages" >&2
    exit 1
  fi
fi

# ── build / tag / push each component ───────────────────────────────────────
for component in "${COMPONENTS[@]}"; do
  ver="$(resolve_version "$component")"
  image="$REGISTRY/$OWNER/$PROJECT-$component"
  context="$ROOT/$component"

  echo
  echo "━━ $PROJECT-$component  →  $image:$ver$($TAG_LATEST && echo ' (+ latest)')"

  tags=(-t "$image:$ver")
  $TAG_LATEST && tags+=(-t "$image:latest")

  if $PUSH; then
    docker buildx build \
      --platform "$PLATFORMS" \
      "${tags[@]}" \
      --push \
      "$context"
    echo "✓ pushed $image:$ver"
  else
    # local build: buildx --load is single-arch only; use the host's arch.
    docker buildx build \
      "${tags[@]}" \
      --load \
      "$context"
    echo "✓ built locally $image:$ver (not pushed)"
  fi
done

echo
echo "Done."
