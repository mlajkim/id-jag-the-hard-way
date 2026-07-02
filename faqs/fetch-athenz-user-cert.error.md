


## IdP token endpoint must be an https url

Happens when the IdP uses http instead of https for its token endpoint.

```sh
kubectl logs -n athenz -l athenz=zts-server | grep 'IdP token endpoint must be an https url'
```