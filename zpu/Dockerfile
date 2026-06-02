FROM golang:1.22-bookworm AS build

WORKDIR /src

COPY go.mod ./
RUN go mod download

COPY main.go ./

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/zpu .

FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/zpu /zpu

USER nonroot:nonroot

ENTRYPOINT ["/zpu"]
