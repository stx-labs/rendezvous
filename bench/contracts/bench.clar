;; Minimal contract used to benchmark Rendezvous throughput. The logic is kept
;; trivial on purpose so the measurements reflect Rendezvous and simnet
;; overhead rather than contract execution cost.

(define-data-var last-sum uint u0)

;; `mod` keeps the sum far from overflow for any generated uint.
(define-public (add-pair (a uint) (b uint))
  (ok (var-set last-sum (+ (mod a u1000) (mod b u1000))))
)

;; #[env(simnet)]
(define-read-only (invariant-sum-bounded)
  (< (var-get last-sum) u2000)
)

;; #[env(simnet)]
(define-private (test-add-pair (a uint) (b uint))
  (begin
    (unwrap! (add-pair a b) (err u2))
    ;; `(ok false)` would count as a discard, so fail with an `err` instead.
    (asserts! (< (var-get last-sum) u2000) (err u1))
    (ok true)
  )
)

;; #[env(simnet)]
;; Required by Rendezvous in invariant mode to record call counts.
(define-map context
  (string-ascii 100)
  { called: uint }
)

;; #[env(simnet)]
(define-private (update-context
    (function-name (string-ascii 100))
    (called uint)
  )
  (ok (map-set context function-name { called: called }))
)
