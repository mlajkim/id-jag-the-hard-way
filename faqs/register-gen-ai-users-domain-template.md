# Goal

Register and apply the GenAI users delegation domain template without editing
the ZMS default `solution_templates.json`.

<!-- TOC depthFrom:2 depthTo:3 -->

- [Step 1. Create the Target Domains](#step-1-create-the-target-domains)
- [Step 2. Load the Custom Template ConfigMap](#step-2-load-the-custom-template-configmap)
- [Step 3. Restart ZMS](#step-3-restart-zms)
- [Step 4. Apply the Template to a Service Domain](#step-4-apply-the-template-to-a-service-domain)
- [Step 5. Verify](#step-5-verify)
- [FAQ](#faq)
- [Reference](#reference)

<!-- /TOC -->

# Prerequisites

- Have the local Kubernetes cluster configured for this repo.
- Have `kubectl` pointed at that cluster.
- Have the Athenz ZMS custom solution-template PR applied. It adds
  `athenz-zms-custom-solution-templates` and merges it with the default
  templates at ZMS pod startup.

# Steps

Here is the procedure to get to the goals.

## Step 1. Create the Target Domains

```sh
./tools/athenz/create-tld.sh "flava"
./tools/athenz/create-subdomain.sh "flava" "context-ai"
```

If `flava` already exists, skip the TLD command and create only the subdomain.

## Step 2. Load the Custom Template ConfigMap

The template is kept as a normal JSON file:

```sh
cat faqs/statics/gen-ai-users-delegation-solution-template.json
```

Load that file directly into the custom ZMS solution-template ConfigMap:

```sh
kubectl -n athenz create configmap athenz-zms-custom-solution-templates \
  --from-file=custom_solution_templates.json=faqs/statics/gen-ai-users-delegation-solution-template.json \
  --dry-run=client -o yaml | kubectl apply -f -
```

Check:

```sh
kubectl -n athenz get configmap athenz-zms-custom-solution-templates \
    -o jsonpath='{.data.custom_solution_templates\.json}' | jq .
```

```sh
# {
#   "templates": {
#     "gen_ai_users_delegation": {
#       "metadata": {
#         "latestVersion": 1,
#         "timestamp": "2026-07-15T00:00:00.000Z",
#         ...
```

## Step 3. Restart ZMS

Restart ZMS so it loads the custom solution template:

```sh
kubectl -n athenz rollout restart deployment/athenz-zms-server
kubectl -n athenz rollout status deployment/athenz-zms-server
```

Expected result:

```sh
# deployment.apps/athenz-zms-server restarted
# deployment "athenz-zms-server" successfully rolled out
```

## Step 4. Apply the Template to a Service Domain

```sh
kubectl -n athenz exec deployment/athenz-cli -it -- \
  zms-cli \
    -z https://athenz-zms-server.athenz:4443/zms/v1 \
    -key /var/run/athenz/athenz_admin.private.pem \
    -cert /var/run/athenz/athenz_admin.cert.pem \
    -d flava.context-ai \
    set-domain-template \
    gen_ai_users_delegation \
    service_code="context-ai"
```

Expected result:

```sh
# [Template(s) successfully applied to domain]
```

## Step 5. Verify

Open the generated domain in Athenz UI, or inspect it with `zms-cli`.

Expected roles:

```text
flava.context-ai:role.context-ai.gen-ai-users
flava.context-ai:role.context-ai.gen-ai-users-manager
flava.context-ai:role.context-ai.gen-ai-users-jag-exchanger
```

Expected model:

```text
gen-ai-users: real users such as user.<name>
gen-ai-users-jag-exchanger: trusted exchanger identity
```

# FAQ

## What is an Athenz domain template?

An Athenz domain template is a predefined bundle of domain objects. It can create roles, policies, services, and assertions with placeholders such as `_domain_` and `_service_code_`.

## Why use the custom solution-template ConfigMap?

It keeps the default `solution_templates.json` unchanged. ZMS starts with the default templates when the custom ConfigMap is absent, and merges custom templates only when `athenz-zms-custom-solution-templates` exists.

## What should `gen-ai-users` contain?

`gen-ai-users` should contain human principals such as `user.<name>`. AI tools or gateway services should not be added as normal user members.

## What does the template create?

It creates the standard GenAI roles and policies for a service domain:

- `role.<service_code>.gen-ai-users`
- `role.<service_code>.gen-ai-users-manager`
- `role.<service_code>.gen-ai-users-jag-exchanger`
- membership-management policies
- `zts.jag_exchange` permission into `gen-ai-users`

## How do I remove the custom template?

Delete the custom ConfigMap and restart ZMS:

```sh
kubectl -n athenz delete configmap athenz-zms-custom-solution-templates
kubectl -n athenz rollout restart deployment/athenz-zms-server
kubectl -n athenz rollout status deployment/athenz-zms-server
```

# Reference

- [GenAI users delegation solution template](./statics/gen-ai-users-delegation-solution-template.json)
- [Athenz ZMS custom solution templates](../athenz_dist/kubernetes/athenz-zms-server/README.md)
