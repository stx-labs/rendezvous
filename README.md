<div align="center">
<img width="304" src="https://raw.githubusercontent.com/moodmosaic/nikosbaxevanis.com/gh-pages/images/rv.png" />
</div>

## Rendezvous `rv`: The Clarity Fuzzer

Rendezvous `rv` is a Clarity fuzzer designed to cut through your smart contract's defenses with precision. Uncover vulnerabilities with unmatched power and intensity. Get ready to meet your contract's vulnerabilities head-on.

### Prerequisites

- **Node.js**: Supported versions include 20, 22, and 24. Other versions may work, but they are untested.

### Inspiration

The `rv` fuzzer, inspired by John Hughes' paper _"Testing the Hard Stuff and Staying Sane"_[^1], ensures contract robustness with Clarity invariants and tests.

### Example Directory Structure

```
root
├── Clarinet.toml
├── contracts
│   └── contract.clar
└── settings
    └── Devnet.toml
```

### Installation

```
npm install @stacks/rendezvous
```

### Usage

```
npx rv <path-to-clarinet-project> <contract-name> <type>
```

---

### Configuration

**Positional arguments:**

- `path-to-clarinet-project` - Path to the root directory of the Clarinet project (where Clarinet.toml exists).
- `contract-name` - Name of the contract to test, per Clarinet.toml.
- `type` - Type of test to run. Options:
  - `test` - Run property-based tests.
  - `invariant` - Run invariant tests.

**Options:**

- `--config` – Path to a JSON config file. When provided, all run options come
  from the config file exclusively (CLI flags are ignored).
- `--seed` – The seed to use for the replay functionality.
- `--runs` – The number of test iterations to use for exercising the contracts.
  (default: `100`)
- `--regr` – Run regression tests only (replay saved failures).
- `--bail` – Stop after the first failure.
- `--fail-on-unchecked` – Fail the run (exit code 1) if a test or invariant was
  never checked (all of its cases were discarded, or it was never selected).
  It also fails inconclusive invariant campaigns where every public call
  throws; these only warn by default.
- `--dial` – The path to a JavaScript file containing custom pre- and
  post-execution functions (dialers).

---

### Example (`test`)

Here's an example of a test that checks reversing a list twice returns the original:

```clarity
;; #[env(simnet)]
(define-private (test-reverse-list (seq (list 127 uint)))
  (begin
    (asserts!
      (is-eq seq
        (reverse-uint
          (reverse-uint seq)))
      (err u999))
    (ok true)))
```

You can run property-based tests using `rv` with the following command:

```
rv example reverse test
```

---

### Example (`invariant`)

Here's a Clarity invariant to detect a bug in the example counter contract:

```clarity
;; #[env(simnet)]
(define-read-only (invariant-counter-gt-zero)
  (let
      ((increment-num-calls (default-to u0 (get called (map-get? context "increment"))))
       (decrement-num-calls (default-to u0 (get called (map-get? context "decrement")))))
    (if (> increment-num-calls decrement-num-calls)
        (> (var-get counter) u0)
        true)))
```

You can run invariant tests using `rv` with the following command:

```
rv example counter invariant
```

---

### Library API

Rendezvous also works as a library for building custom property-based testing strategies. It handles the hard part — generating valid random Clarity arguments for any function signature, including recursive types, trait references, and custom accounts.

```ts
import { initSimnet } from "@stacks/clarinet-sdk";
import { getContractFunction, strategyFor } from "@stacks/rendezvous";
import fc from "fast-check";

const simnet = await initSimnet("./Clarinet.toml");
const add = getContractFunction(simnet, "counter", "add");
const arb = strategyFor(simnet, add);

fc.assert(
  fc.property(arb, (args) => {
    const { result } = simnet.callPublicFn(
      `${simnet.deployer}.counter`,
      "add",
      args,
      simnet.deployer,
    );
    return result.type !== "err";
  }),
);
```

- `getContractFunction(simnet, contract, fn, deployer?)` — retrieves a function interface, enriched with trait data.
- `strategyFor(simnet, fn, allAddresses?, projectTraitImplementations?)` — returns an `fc.Arbitrary<ClarityValue[]>` ready for use with `simnet.callPublicFn`, `simnet.callReadOnlyFn`, or `simnet.callPrivateFn`. `allAddresses` restricts the principal pool (defaults to every account in the simnet); `projectTraitImplementations` reuses a precomputed trait map (defaults to extracting it from the simnet).

---

### Trophy Case

Real bugs and security vulnerabilities uncovered with `rv`. To add a finding, open a pull request appending a row to the table below.

| Date        | Project                                                          | Vulnerability                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Invariant/Property                                                                                                                                                                           | Version      | Submitter                                  |
| ----------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------ |
| May 8, 2026 | [Jing v3](https://github.com/Rapha-btc/jing-contracts-v3)        | Cancel-cycle overwrote next-cycle totals rolled forward by the small-share deposit filter, silently wiping the accounting                                                                                                                                                                                                                                                                                                                                                                       | [`invariant-balance-eq-cycle-totals`](https://github.com/Rapha-btc/jing-contracts-v3/blob/4ff5170ac912b6948f34e5ad4ab3603ee28e1f35/tests/rv/markets-sbtc-stx-jing.invariants.clar#L226-L237) | `1.0.0-rc.1` | [@Rapha-btc](https://github.com/Rapha-btc) |
| Jul 4, 2026 | [MIA Orderbook](https://github.com/Rapha-btc/mia-single-faktory) | Unbounded ask price overflowed the book's cross-multiplication folds — one refundable poison offer ([`c177f7e`](https://github.com/Rapha-btc/mia-single-faktory/blob/c177f7e16bcce95796856d11c32b06c10c920b81/contracts/mia-orderbook-jing.clar)) permanently froze `place-offer`/`change-offer`/`market-order` (no fund loss); caught pre-mainnet, fixed with a `MAX_ASK` bound ([`ff1543b`](https://github.com/Rapha-btc/mia-single-faktory/commit/ff1543ba651a87696f3ffefc1b2068b06bd96f03)) | [`mia-orderbook-jing.tests.clar`](https://github.com/Rapha-btc/mia-single-faktory/blob/67f73217b3651e808ed66f4102169336969a823f/rendezvous/harnesses/mia-orderbook-jing.tests.clar)          | `1.0.1`      | [@Rapha-btc](https://github.com/Rapha-btc) |

---

### Documentation

For full documentation, see the official [Rendezvous Book](https://stx-labs.github.io/rendezvous/).

---

[^1]: Hughes, J. (2004). _Testing the Hard Stuff and Staying Sane_. In Proceedings of the ACM SIGPLAN Workshop on Haskell (Haskell '04).
