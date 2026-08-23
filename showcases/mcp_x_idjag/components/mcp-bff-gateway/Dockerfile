FROM golang:1.26.4-bookworm AS builder
WORKDIR /src

ARG TARGETOS=linux
ARG TARGETARCH
ENV CGO_ENABLED=0 \
    GOOS=${TARGETOS} \
    GOARCH=${TARGETARCH} \
    GOPROXY=direct \
    GOINSECURE=* \
    GOSUMDB=off \
    GIT_SSL_NO_VERIFY=1

RUN git config --global http.sslVerify false
COPY go.mod ./
COPY *.go ./
RUN go build -trimpath -ldflags='-s -w' -o /out/mcp-bff-gateway .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /out/mcp-bff-gateway /mcp-bff-gateway
USER nonroot:nonroot
ENTRYPOINT ["/mcp-bff-gateway"]
