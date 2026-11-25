# NextUp order form: where it runs and which AI

> **Draft for Marc, 2026-11-11.** Not sent to a customer before Marc has read it. Plan S, issue #658 (Q8.8). Not legal
> text that has been reviewed. The customer fills it in with NextUp before the server is set up: both choices decide
> how the server is built.

## 1. The company

| | |
|---|---|
| Company | **[ ]** |
| Address the people use | `https://`**[ ]** |
| Pilot lead | name, mail, phone **[ ]** |
| IT contact | name, mail, phone **[ ]** |
| Company admin | name, mail **[ ]** |
| Data protection officer | name, mail **[ ]** |

NextUp writes to these people about releases, incidents and the end of the contract.

## 2. Where it runs

Choose one.

- [ ] **NextUp hosts it.** NextUp rents a server in Germany for this company alone, installs and runs it. NextUp has
  root on that server.
- [ ] **On your own server.** Your IT provides the server and is root on it. NextUp reaches it only through the release
  key (`release` and `status`) and a break-glass window your IT opens. Requirements: [INSTALL.md](INSTALL.md).

## 3. Which AI

NextUp works with the AI off. The AI is the customer's choice: it reads what your people write. Decide it with your
data protection officer, and with the works council where you have one. Choose one.

| | Choice | Where the text goes | Who signs what | Possible when |
|---|---|---|---|---|
| [ ] | **Off** (the pilot default) | nowhere; NextUp routes by keywords | nothing | always |
| [ ] | **Your own provider** (Azure OpenAI, or an OpenAI-compatible gateway you run) | to your provider, under your contract | you, with your provider; your IT enters the key, the endpoint and the date of that agreement in the console | always |
| [ ] | **A model on your stack** | nowhere: the model runs on the same server | nothing extra | always; the server needs about 8 GB more memory |
| [ ] | **NextUp's cloud** (Amazon Bedrock, EU region, NextUp's AWS account) | to AWS, as NextUp's sub-processor | NextUp, with AWS | only when NextUp hosts it, and only once Kevin has signed the AWS agreement and AWS confirmed EU routing in writing |

- On your own server we never offer NextUp's cloud: our AWS key would sit on a server whose root is yours.
- NextUp's cloud is **not available today**. Do not tick it until Kevin says it is signed (issue #659).
- A model on your stack: the console choice comes with issue #657. How fast it answers on a server without a graphics
  card is not measured yet.
- You can switch the AI off at any time in the console. Switching it on later, or to another choice, is a change to
  this form.

## 4. Signed before the server is set up

| | Who | Done |
|---|---|---|
| Contract or pilot agreement | both | **[date]** |
| Data processing agreement (`docs/compliance/DPA_TEMPLATE.md`) | both | **[date]** |
| Your provider's agreement, if you chose your own provider | you | **[date]** |

The works agreement, where there is a council, is needed before NextUp opens for your people, not before the server.

## Signatures

| Customer | NextUp |
|---|---|
| Name, role, date, signature: **[ ]** | Name, role, date, signature: **[ ]** |
