;; Four pooled balance slots; the recorded total must equal their sum.
(define-map balances uint uint)
(define-data-var total uint u0)

(define-read-only (get-balance (slot uint))
  (default-to u0 (map-get? balances slot))
)

(define-read-only (get-total)
  (var-get total)
)

(define-public (credit (slot uint) (amount uint))
  (let ((key (mod slot u4)) (value (+ u1 (mod amount u1000))))
    (map-set balances key (+ (get-balance key) value))
    ;; Bug: the total records one extra unit per credit. Remove `u1` to fix.
    (var-set total (+ (var-get total) value u1))
    (ok true)
  )
)

;; Rendezvous context and a complementary Clarity invariant.
(define-map context (string-ascii 100) { called: uint })

(define-private (update-context
    (function-name (string-ascii 100))
    (called uint)
  )
  (ok (map-set context function-name { called: called }))
)

(define-read-only (invariant-first-balance-covered)
  (<= (get-balance u0) (var-get total))
)
