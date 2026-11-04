;; This is a simple counter contract that increments and decrements a counter.
;; Originally copied from https://github.com/hirosystems/clarity-starter/blob/
;; bb300adf36cdaef27247fe8585a0bc69c8b69a61/contracts/counter.clar, afterwards
;; modified to introduce a bug for large values.

(define-data-var counter uint u0)

(define-constant ERR_COUNTER_MUST_BE_POSITIVE (err u401))
(define-constant ERROR_ADD_MORE_THAN_ONE (err u402))
(define-constant MAX_UINT u340282366920938463463374607431768211455)

(define-read-only (get-counter)
  (var-get counter)
)

(define-public (increment)
  (ok (var-set counter (+ (var-get counter) u1)))
)

;; This version of the increment function intentionally introduces a bug for
;; demonstration purposes. Replace the current increment function with the
;; code below to observe RendezVous testing in action.

;; (define-public (increment)
;;   (let ((current-counter (var-get counter)))
;;     (if (> current-counter u1000) ;; Introduce a bug for large values.
;;       (ok (var-set counter u0)) ;; Reset counter to zero if it exceeds 1000.
;;       (ok (var-set counter (+ current-counter u1)))
;;     )
;;   )
;; )

(define-public (decrement)
  (let ((current-counter (var-get counter)))
    (asserts! (> current-counter u0) ERR_COUNTER_MUST_BE_POSITIVE)
    (ok (var-set counter (- current-counter u1)))
  )
)

(define-public (add (n uint))
  (begin
    (asserts! (> n u1) ERROR_ADD_MORE_THAN_ONE)
    (ok (var-set counter (+ (var-get counter) n)))
  )
)

;; #[env(simnet)]
(define-map context
  (string-ascii 100)
  {
    called: uint,
    ;; other data
  }
)

;; #[env(simnet)]
(define-private (update-context
    (function-name (string-ascii 100))
    (called uint)
  )
  (ok (map-set context function-name { called: called }))
)

;; #[env(simnet)]
;; Invariant function that checks that the counter is greater than zero if the
;; number of calls to `increment` is greater than the number of calls to
;; `decrement`.
(define-read-only (invariant-counter-gt-zero)
  (let (
      (increment-num-calls (default-to u0 (get called (map-get? context "increment"))))
      (decrement-num-calls (default-to u0 (get called (map-get? context "decrement"))))
    )
    (if (<= increment-num-calls decrement-num-calls)
      true
      (> (var-get counter) u0)
    )
  )
)

;; #[env(simnet)]
;; This test catches the bug in the counter contract.
(define-private (test-increment)
  (let ((counter-before (get-counter)))
    (if (is-eq counter-before MAX_UINT)
      ;; Discard: incrementing the maximum uint would overflow.
      (ok false)
      (begin
        (unwrap-panic (increment))
        (asserts! (is-eq (get-counter) (+ counter-before u1)) (err u404))
        (ok true)
      )
    )
  )
)

;; #[env(simnet)]
;; Test that takes a parameter. This will be run using property-based
;; techniques.
(define-private (test-add (n uint))
  (let ((counter-before (get-counter)))
    (ok (if (or (<= n u1) (> n (- MAX_UINT counter-before)))
      ;; Discard the test if `add` cannot be called with the given parameter,
      ;; or if adding it would overflow the counter.
      false
      (begin
        (try! (add n))
        (asserts! (is-eq (get-counter) (+ counter-before n)) (err u403))
        true
      )
    ))
  )
)
