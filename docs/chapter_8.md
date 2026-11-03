# Examples

The Rendezvous repo has a Clarinet project, `example`, that shows how to test Clarity smart contracts natively. Each contract includes its test functions (invariants and property-based tests) directly in the `.clar` file, annotated with `#[env(simnet)]` for conditional deployment.

## What's Inside

[The `counter` Contract](#the-counter-contract)

- [Invariants](#invariants)
  - [Invariant logic](#invariant-logic)
  - [Checking the invariants](#checking-the-invariants)
- [Property-Based Tests](#property-based-tests)
  - [Test logic](#test-logic)
  - [Checking the properties](#checking-the-properties)

[The `cargo` Contract](#the-cargo-contract)

- [Invariants](#invariants-1)
  - [Invariant logic](#invariant-logic-1)
  - [Checking the invariants](#checking-the-invariants-1)
- [Property-Based Tests](#property-based-tests-1)
  - [Test logic](#test-logic-1)
  - [Checking the properties](#checking-the-properties-1)

[The `reverse` Contract](#the-reverse-contract)

- [Property-Based Tests](#property-based-tests-2)
  - [Test logic](#test-logic-2)
  - [Checking the properties (shrinking)](#checking-the-properties-2)

[The `slice` Contract](#the-slice-contract)

- [Property-Based Tests](#property-based-tests-3)
  - [Test logic](#test-logic-3)
  - [Checking the properties (discarding)](#checking-the-properties-3)

---

## The `counter` Contract

The `counter` contract is a simple Clarity example found in the `example` Clarinet project. It has no known vulnerabilities. However, to see how Rendezvous works, we can **introduce a bug** into the `increment` function. This bug resets the counter to `0` when the counter value exceeds `1000`. The faulty `increment` function is already included (but commented out) in the `counter` contract:

```clarity
(define-public (increment)
  (let
    (
      (current-counter (var-get counter))
    )
    (if
      (> current-counter u1000) ;; Introduce a bug for large values.
      (ok (var-set counter u0)) ;; Reset counter to zero if it exceeds 1000.
      (ok (var-set counter (+ current-counter u1)))
    )
  )
)
```

To test the buggy version of the contract, replace the valid `increment` function with the faulty version. Then, you can write Clarity invariants and property-based tests to detect the issue.

### Invariants

One invariant that can detect the introduced bug is:

```clarity
(define-read-only (invariant-counter-gt-zero)
  (let
    (
      (increment-num-calls
        (default-to u0
          (get called (map-get? context "increment"))
        )
      )
      (decrement-num-calls
        (default-to u0
          (get called (map-get? context "decrement"))
        )
      )
    )
    (if
      (<= increment-num-calls decrement-num-calls)
      true
      (> (var-get counter) u0)
    )
  )
)
```

This invariant uses the **context** utility from Rendezvous, described in the previous chapter. It establishes a fundamental rule for the counter contract:

> If, at the time of the check, the `increment` function has been called successfully more times than `decrement`, the counter value should be greater than 0.

#### Invariant logic

`increment-num-calls ≤ decrement-num-calls`:

- The invariant automatically holds.
- This case means decrements occurred at least as many times as increments, so the invariant does not enforce any condition.

`increment-num-calls > decrement-num-calls`:

- The invariant asserts that `counter > u0`.
- This ensures that, despite more increment calls, the counter remains positive.

#### Checking the invariants

To check the `counter` contract's invariants, run:

```bash
rv ./example counter invariant
```

Using this command, Rendezvous will **randomly execute public function calls** in the `counter` contract while **periodically checking the invariant**. If the invariant fails, it indicates that the contract's internal state has deviated from expected behavior, exposing the bug in the faulty `increment` function.

### Property-Based Tests

Another way to detect the introduced bug is by writing this property-based test:

```clarity
(define-private (test-increment)
  (let
    (
      (counter-before (get-counter))
    )
    (unwrap-panic (increment))
    (asserts! (is-eq (get-counter) (+ counter-before u1)) (err u404))
    (ok true)
  )
)
```

This test is a **property-based test**, where a _property_ (a truth, or characteristic) of the `increment` function is tested across different inputs.

> The counter should always increase by 1 after a successful call to `increment`.

If the test fails, it means the counter did not increment as expected, revealing unintended behavior such as the counter resetting to `0`.

#### Test logic

1. Record the counter value before calling `increment`.
2. Call `increment` and ensure it does not fail.
3. Check that the new counter value equals the previous value +1.
   - If this condition does not hold, the test fails with error `u404`.
   - This catches unexpected changes, such as the counter resetting.

#### Checking the properties

To run Rendezvous property-based tests against the counter contract, use:

```bash
rv ./example counter test
```

Using this command, Rendezvous will **randomly select and execute** property-based tests from the `counter` contract. This process will detect the bug in the faulty increment function. However, if the contract contains only `test-increment`, **the number of runs must be increased**. By default, Rendezvous executes **100 runs**, which may not be sufficient to expose the issue.

To make sure you always catch the bug, set the `--runs` option to something higher than `1001`, e.g. **1002**:

```bash
rv ./example counter test --runs=1002
```

This ensures that enough test cases are executed to trigger the `counter` reset condition.

---

## The `cargo` Contract

The `cargo` contract is a decentralized shipment tracker found in the `example` Clarinet project. Initially, it contained a bug where the `last-shipment-id` variable was not updated when creating a new shipment. This bug has been fixed, but you can re-introduce it to see how Rendezvous detects it:

```clarity
(define-public (create-new-shipment (starting-location (string-ascii 25))
                                    (receiver principal))
  (let
    (
      (new-shipment-id (+ (var-get last-shipment-id) u1))
    )
    ;; #[filter(starting-location, receiver)]
    (map-set shipments new-shipment-id {
      location: starting-location,
      status: "In Transit",
      shipper: tx-sender,
      receiver: receiver
    })

    ;; The following line fixes the bug in the original implementation.
    ;; Comment out this line to re-introduce the bug.
    ;; (var-set last-shipment-id new-shipment-id)
    (ok "Shipment created successfully")
  )
)
```

To test the buggy version of the contract, **comment out the line that updates `last-shipment-id`**. Then, use invariants and property-based tests to detect the issue.

### Invariants

One invariant that can detect the introduced bug is:

```clarity
(define-read-only (invariant-last-shipment-id-gt-0-after-create-shipment)
  (let
    (
      (create-shipment-num-calls
        (default-to u0 (get called (map-get? context "create-new-shipment")))
      )
    )
    (if
      (is-eq create-shipment-num-calls u0)
      true
      (> (var-get last-shipment-id) u0)
    )
  )
)
```

This invariant uses the **context** utility from Rendezvous, described in the previous chapter. It enforces a fundamental rule of the `cargo` contract:

> If at least one shipment has been created, the `last-shipment-id` must be greater than 0.

#### Invariant logic

`create-shipment-num-calls = 0`:

- The invariant holds automatically (no shipments created, so no condition to check).

`create-shipment-num-calls > 0`:

- The invariant asserts that `last-shipment-id > 0`.
- If this check fails, it means `last-shipment-id` was **not updated** after creating a shipment, exposing the bug.

#### Checking the invariants

To run Rendezvous invariant testing against the `cargo` contract, use:

```bash
rv ./example cargo invariant
```

Using this command, Rendezvous will **randomly execute public function calls** in the `cargo` contract while **periodically checking the invariant**. If the invariant fails, it signals that `last-shipment-id` was not updated as expected, revealing the bug.

### Property-Based Tests

A property-based test that can detect the introduced bug is:

```clarity
(define-private (test-get-last-shipment-id
    (starting-location (string-ascii 25))
    (receiver principal)
  )
  (let
    ((shipment-id-before (get-last-shipment-id)))
    (unwrap!
      (create-new-shipment starting-location receiver)
      ERR_CONTRACT_CALL_FAILED
    )
    ;; Verify the last shipment ID is incremented by 1.
    (asserts!
      (is-eq (get-last-shipment-id) (+ u1 shipment-id-before))
      ERR_ASSERTION_FAILED
    )
    (ok true)
  )
)
```

This test follows a **property-based testing approach**, verifying a key property of `create-new-shipment`:

> Creating a new shipment should always increment `last-shipment-id` by 1.

### Test logic

1. Record the current shipment ID before calling `create-new-shipment`.
2. Call `create-new-shipment`, ensuring it does not fail.
3. Verify that `last-shipment-id` has **increased by 1**.
   - If this check fails, it means `last-shipment-id` was **not updated**, exposing the bug.

#### Checking the properties

To run Rendezvous property-based tests against the `cargo` contract, use:

```bash
rv ./example cargo test
```

Using this command, Rendezvous will **randomly select and execute** property-based tests from the `cargo` contract. If `test-get-last-shipment-id` is the only test in the contract, Rendezvous will immediately detect the bug.

---

## The `reverse` Contract

The `reverse` contract included in the `example` Clarinet project contains Clarity utilities for reversing lists of various types. Since it lacks public functions, **invariant testing doesn’t apply**. However, it serves as an ideal "Hello World" example for **property testing using native Clarity**—_reversing a list twice should always return the original list_.

Introducing a bug and detecting it with Rendezvous property-based tests is insightful, not just for finding the issue but for demonstrating the power of **shrinking**. Below is an example of how to introduce a bug into one of the `reverse-uint` private utilities:

```clarity
(define-read-only (reverse-uint (seq (list 127 uint)))
 (reverse-list1 seq)
)

(define-private (reverse-list1 (seq (list 127 uint)))
  (fold reverse-redx-unsigned-list seq (list))
)

(define-private (reverse-redx-unsigned-list (item uint) (seq (list 127 uint)))
  (unwrap-panic
    (as-max-len?
      (concat (list item) seq)
      u4 ;; Introduces a bug by limiting max length incorrectly.
    )
  )
)
```

This bug **reduces the maximum supported list length** in a private function, leading to an **unwrap failure runtime error** when the list exceeds the new, incorrect limit.

### Property-Based Tests

A property-based test that can detect the introduced bug is:

```clarity
(define-private (test-reverse-uint (seq (list 127 uint)))
  (begin
    (asserts!
      (is-eq seq (reverse-uint (reverse-uint seq)))
      ERR_ASSERTION_FAILED
    )
    (ok true)
  )
)
```

This test follows a **property-based testing approach**, verifying the "Hello World" of property testing:

> Reversing a list twice should always return the original list.

This test example accepts a parameter, which is randomly generated for each run.

#### Test logic

1. Verify that reversing a passed list twice is always equal to the passed list.

#### Checking the properties

To run Rendezvous property-based tests against the `reverse` contract, use:

```bash
rv ./example reverse test
```

**Shrinking at its finest**

When a property-based test fails, **Rendezvous automatically shrinks the failing test case** to find **the smallest possible counterexample**. This process helps pinpoint the root cause of the bug by **removing unnecessary complexity**. Sample Rendezvous output showcasing the **shrinking** process:

```
₿     3494 Ӿ     3526   wallet_3 [FAIL] reverse test-reverse-uint [332420496,1825325546,120054597,1173935866,164214015] (runtime)
₿     3494 Ӿ     3527   wallet_3 [PASS] reverse test-reverse-uint [120054597,1173935866,164214015]
₿     3494 Ӿ     3529   wallet_3 [FAIL] reverse test-reverse-uint [0,1825325546,120054597,1173935866,164214015] (runtime)
₿     3494 Ӿ     3530   wallet_3 [PASS] reverse test-reverse-uint [120054597,1173935866,164214015]
₿     3494 Ӿ     3532   wallet_3 [PASS] reverse test-reverse-uint [0]
₿     3494 Ӿ     3533   wallet_3 [PASS] reverse test-reverse-uint [0,1173935866,164214015]
₿     3494 Ӿ     3534   wallet_3 [PASS] reverse test-reverse-uint [0,120054597,1173935866,164214015]
₿     3494 Ӿ     3535   wallet_3 [FAIL] reverse test-reverse-uint [0,0,120054597,1173935866,164214015] (runtime)
...
₿     3494 Ӿ     3537   wallet_3 [PASS] reverse test-reverse-uint [0,120054597,1173935866,164214015]
₿     3494 Ӿ     3538   wallet_3 [PASS] reverse test-reverse-uint [0]
₿     3494 Ӿ     3539   wallet_3 [PASS] reverse test-reverse-uint [0,1173935866,164214015]
₿     3494 Ӿ     3541   wallet_3 [PASS] reverse test-reverse-uint [0,0]
₿     3494 Ӿ     3542   wallet_3 [PASS] reverse test-reverse-uint [0,0,1173935866,164214015]
₿     3494 Ӿ     3543   wallet_3 [FAIL] reverse test-reverse-uint [0,0,0,1173935866,164214015] (runtime)
₿     3494 Ӿ     3545   wallet_3 [PASS] reverse test-reverse-uint [0,0,1173935866,164214015]
₿     3494 Ӿ     3546   wallet_3 [PASS] reverse test-reverse-uint [0]
₿     3494 Ӿ     3547   wallet_3 [PASS] reverse test-reverse-uint [0,1173935866,164214015]
₿     3494 Ӿ     3549   wallet_3 [PASS] reverse test-reverse-uint [0,0]
₿     3494 Ӿ     3550   wallet_3 [PASS] reverse test-reverse-uint [0,0,1173935866,164214015]
₿     3494 Ӿ     3551   wallet_3 [PASS] reverse test-reverse-uint [0,0,0]
₿     3494 Ӿ     3552   wallet_3 [PASS] reverse test-reverse-uint [0,0,0,164214015]
₿     3494 Ӿ     3553   wallet_3 [FAIL] reverse test-reverse-uint [0,0,0,0,164214015] (runtime)
₿     3494 Ӿ     3554   wallet_3 [PASS] reverse test-reverse-uint [0,0,164214015]
...
₿     3494 Ӿ     3562   wallet_3 [PASS] reverse test-reverse-uint [0,0,0,164214015]
₿     3494 Ӿ     3563   wallet_3 [PASS] reverse test-reverse-uint [0,0,0,0]
₿     3494 Ӿ     3564   wallet_3 [FAIL] reverse test-reverse-uint [0,0,0,0,0] (runtime)
₿     3494 Ӿ     3565   wallet_3 [PASS] reverse test-reverse-uint [0,0,0]
...
₿     3494 Ӿ     3574   wallet_3 [PASS] reverse test-reverse-uint [0,0,0,0]

Error: Property failed after 23 tests.
Seed : 869018352

Counterexample:
- Test Contract : reverse
- Test Function : test-reverse-uint (private)
- Arguments     : [[0,0,0,0,0]]
- Caller        : wallet_3
- Outputs       : {"type":{"response":{"ok":"bool","error":"int128"}}}

What happened? Rendezvous went on a rampage and found a weak spot:

The test function "test-reverse-uint" returned:

    Call contract function error: ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.reverse::test-reverse-uint((list u0 u0 u0 u0 u0)) -> Error calling contract function: Runtime error while interpreting ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.reverse: Runtime(UnwrapFailure, Some([FunctionIdentifier { identifier: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.reverse:test-reverse-uint" }, FunctionIdentifier { identifier: "_native_:special_asserts" }, FunctionIdentifier { identifier: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.reverse:reverse-uint" }, FunctionIdentifier { identifier: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.reverse:reverse-list1" }, FunctionIdentifier { identifier: "_native_:special_fold" }, FunctionIdentifier { identifier: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.reverse:reverse-redx-unsigned-list" }, FunctionIdentifier { identifier: "_native_:native_unwrap" }]))
```

To observe shrinking in action, pay attention to the `FAIL` logs. The minimal counterexample found is:

```
[0,0,0,0,0]
```

This is exactly what we were looking for! The bug we introduced is not related to the **values** in the list but to the **list length**.

By starting with larger, more complex failing test cases and shrinking down to a list of five zeros, Rendezvous reveals that the **issue is with the number of elements, not their values**. This insight is crucial—it tells us that our bug causes failures when the list length exceeds a certain threshold, not when specific numbers are present.

This is the power of **shrinking** in property-based testing: it strips away distractions and zeroes in on the core problem.

---

## The `slice` Contract

The `slice` contract included in the `example` Clarinet project contains Clarity utilities for slicing lists of various types. Same as `reverse`, it lacks public functions, so **invariant testing doesn’t apply**. Using Rendezvous and property-based tests to test this contract will highlight the **discarding** mechanism of the Clarity property-based tests.

Let's introduce a bug in the `slice` contract:

```clarity
(define-read-only (slice-uint (seq (list 127 uint)) (skip int) (n int))
  (begin
    (assert- (and (<= 0 skip) (<= skip 127)) "Out of bounds: skip")
    (assert- (and (<= 0 n) (<= n 127)) "Out of bounds: n")
    (slice-list1 seq skip n)
  )
)

(define-private (slice-list1
                 (seq (list 127 uint))
                 (skip int)
                 (n int))
  (begin
    (assert- (and (<= 0 skip) (<= skip 127)) "Out of bounds: skip")
    (assert- (and (<= 0 n) (<= n 127)) "Out of bounds: n")
    (let
      (
        (end
          (-
            (min-num-integer-integer (+ skip n) (to-int (len seq)))
            1
          )
        )
      )
      (if
        (>= end 1) ;; Introduce a bug that forces `skip` to always be 1 in this comparison.
        (let
          ((i (range-1-integer-integer skip end)))
          (map for-step-integer-list1 i (repeat127-list1 seq))
        )
        (list)
      )
    )
  )
)
```

The issue lies in the conditional check `(>= end 1)`, where the `skip` value is hardcoded to `1` instead of using the user-provided input. This leads to unexpected behavior:

- Lists that should include elements from earlier positions **incorrectly skip the first item**.
- Certain inputs may trigger an **unwrap failure runtime error** when slicing beyond valid bounds.

### Property-Based Tests

The following property-based test evaluates the correctness of `slice-uint`:

```clarity
(define-private (test-slice-list-uint (seq (list 127 uint)) (skip int) (n int))
  (if
    ;; Discard the test if the input is invalid by returning `(ok false)`.
    (or
      (not (and (<= 0 n) (<= n 127)))
      (not (and (<= 0 skip) (<= skip 127)))
    )
    (ok false)
    (let
      ((result (slice-uint seq skip n)))
      (if
        ;; Case 1: If skip > length of seq, result should be an empty list.
        (> (to-uint skip) (len seq))
        (asserts! (is-eq result (list )) ERR_ASSERTION_FAILED_1)
        (if
          ;; Case 2: If n > length of seq - skip, result length should be
          ;; length of seq - skip.
          (> (to-uint n) (- (len seq) (to-uint skip)))
          (asserts!
            (is-eq (len result) (- (len seq) (to-uint skip)))
            ERR_ASSERTION_FAILED_2
          )
          ;; Case 3: If n <= length of seq - skip, result length should be n.
          (asserts! (is-eq (len result) (to-uint n)) ERR_ASSERTION_FAILED_3)
        )
      )
      (ok true)
    )
  )
)
```

#### Test logic

Test Case Discarding:

- If `skip` or `n` are out of valid bounds (`0 ≤ skip, n ≤ 127`), the test is discarded (returns `(ok false)`).
- This ensures only meaningful cases are tested.

Valid Cases and Expected Behavior:

- **Case 1**: When `skip` exceeds the length of the list, the result should be an empty list.
- **Case 2**: When `n` is larger than the remaining elements after `skip`, the result should contain all the remaining elements.
- **Case 3**: When `n` is within valid bounds, the result should contain exactly `n` elements.

#### Checking the properties

To run Rendezvous property-based tests against the `slice` contract, use:

```bash
rv ./example slice test --seed=17 --runs=100
```

**Discarding at its finest**

A key aspect introduced in this test is the **discarding** mechanism. Let's revisit the rules for discarding property-based tests in Rendezvous:

> _A Rendezvous property-based test is considered discarded when one of the following is true:_
>
> 1. The test returns `(ok false)`.
> 2. The test's discard function returns `false` (detailed explanation in [Chapter 6](chapter_6.md)).

**Discarding property-based tests using discard functions**

An example of a property-based test with an attached discard function can also be found in `slice.clar`:

```clarity
;; Some tests, like 'test-slice-list-int', are valid only for specific inputs.
;; Rendezvous generates a wide range of inputs, which may include values that
;; are unsuitable for those tests.
;; To skip the test when inputs are invalid, the first way is to define a
;; 'discard' function:
;; - Must be read-only.
;; - Name should match the property test function's, prefixed with "can-".
;; - Parameters should mirror those of the property test.
;; - Returns true only if inputs are valid, allowing the test to run.
(define-read-only (can-test-slice-list-int
    (seq (list 127 int))
    (skip int)
    (n int)
  )
  (and
    (and (<= 0 n) (<= n 127))
    (and (<= 0 skip) (<= skip 127))
  )
)

(define-private (test-slice-list-int (seq (list 127 int)) (skip int) (n int))
  (let
    ((result (slice seq skip n)))
    (if
      ;; Case 1: If skip > length of seq, result should be an empty list.
      (> (to-uint skip) (len seq))
      (asserts! (is-eq result (list )) ERR_ASSERTION_FAILED_1)
      (if
        ;; Case 2: If n > length of seq - skip, result length should be
        ;; length of seq - skip.
        (> (to-uint n) (- (len seq) (to-uint skip)))
        (asserts!
          (is-eq (len result) (- (len seq) (to-uint skip)))
          ERR_ASSERTION_FAILED_2
        )
        ;; Case 3: If n <= length of seq - skip, result length should be n.
        (asserts! (is-eq (len result) (to-uint n)) ERR_ASSERTION_FAILED_3)
      )
    )
    (ok true)
  )
)
```

The **discarding** mechanism helps filter out invalid test cases, making property-based tests more efficient and ensuring the test results are correctly displayed. Sample output:

```
₿        5 Ӿ      115   wallet_1 [WARN] slice test-slice-list-bool [true,false,false] -17 -1286688432
₿        5 Ӿ      116   wallet_4 [WARN] slice test-slice-list-bool [false,false] 985789078 1631962668
₿        5 Ӿ      117   wallet_1 [WARN] slice test-slice-string b^:hD\"Y. 1744256708 676842982
₿        5 Ӿ      118   wallet_1 [FAIL] slice test-slice-list-uint [1818238100,1267097220,587282248,376122205,358580924,724240912,1327852627,89884546] 17 22 (runtime)
₿        5 Ӿ      119   wallet_8 [WARN] slice test-slice-buff cfe44 -13 15
₿        5 Ӿ      120   wallet_1 [WARN] slice test-slice-buff cfe44 -13 15
₿        5 Ӿ      121   wallet_1 [WARN] slice test-slice-ascii 33!rt -13 15
₿        5 Ӿ      122   wallet_1 [PASS] slice test-slice-list-uint [] 17 22
₿      105 Ӿ      223   wallet_1 [FAIL] slice test-slice-list-uint [358580924,724240912,1327852627,89884546] 17 22 (runtime)
₿      105 Ӿ      224   wallet_1 [FAIL] slice test-slice-list-uint [1327852627,89884546] 17 22 (runtime)
₿      105 Ӿ      225   wallet_1 [PASS] slice test-slice-list-uint [89884546] 17 22
₿      205 Ӿ      326   wallet_1 [FAIL] slice test-slice-list-uint [0,89884546] 17 22 (runtime)
₿      205 Ӿ      327   wallet_1 [PASS] slice test-slice-list-uint [89884546] 17 22
₿      305 Ӿ      428   wallet_1 [PASS] slice test-slice-list-uint [0] 17 22
₿      405 Ӿ      529   wallet_1 [FAIL] slice test-slice-list-uint [0,0] 17 22 (runtime)
```

Tests marked as `WARN` are discarded, meaning they didn’t meet the criteria to be executed. This gives the user a clear view of how often the test actually ran and helps identify patterns in discarded cases.
