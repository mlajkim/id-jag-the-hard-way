# AI Client Gateway

`AI Client Gateway` is a component used by the **id-jag-the-hard-way** where it does:

- Handles the authentication of the AI client
- Exchanges the ID-JAG with an access token
- forwards requests to the Athenz API

This way the AI client agent itself does not hold any access token, which could expose it.

# Notice

This document itself is depending on the main repository **id-jag-the-hard-way**. If you want to learn about this project, please refer to the main [README.md](../README.md)
