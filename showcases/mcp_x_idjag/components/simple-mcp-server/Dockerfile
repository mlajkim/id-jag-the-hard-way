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
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN go build -trimpath -ldflags='-s -w' -o /out/simple-mcp-server .

FROM gcr.io/distroless/static-debian12
COPY --from=builder /out/simple-mcp-server /simple-mcp-server
ENTRYPOINT ["/simple-mcp-server"]
