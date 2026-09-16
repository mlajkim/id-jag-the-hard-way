# Container image builds

The `publish-*.yml` image workflows call `build-multiarch-image.yml`. Each image
builds on native `ubuntu-24.04` (AMD64) and `ubuntu-24.04-arm` (ARM64) runners.
Each runner executes the component checks and builds for its own architecture.
BuildKit caches are separate for each image and architecture.

For publishing runs, each build is pushed to GHCR by digest, then tested using
that exact digest. The shared workflow publishes the combined `latest`, `prNNN`,
or commit tag only after both architecture jobs succeed. The final index contains
both `linux/amd64` and `linux/arm64`, so consumers can keep using the same tag.
The architecture manifests remain in GHCR because the combined index references
them; they must not be deleted as temporary images.

Pull requests from forks build and check local images without registry login or
publication. Same-repository pull requests retain their `prNNN` tags, except for
`idthw-demo-api`, which continues to build without publishing on pull requests.
Manual runs publish a commit tag, and runs on `main` also publish `latest`.

Container checks live in `../scripts/check-container.sh`. They verify the image
architecture and exercise service startup, HTTP responses, or the image's export
command. MCP Runtime Proxy also runs its copied `zts-svccert` executable. AI Client
Gateway checks its TypeScript runtime and native dependency; full gateway startup
requires deployment credentials and is outside these checks.

To check a locally built image:

```sh
docker buildx build --platform linux/arm64 --load \
  -t idthw-demo-api:arm64 components/idthw-demo-api
bash .github/scripts/check-container.sh \
  idthw-demo-api idthw-demo-api:arm64 linux/arm64
```

Use `linux/amd64` to check the other architecture. Local cross-architecture runs
require Docker emulation; GitHub Actions uses native runners for both platforms.
