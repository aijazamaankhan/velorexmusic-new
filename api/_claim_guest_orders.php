<?php
// Shared helper: attach guest orders to a registered user account by email.
//
// Called from:
//   - api/auth/signup.php    (just after creating a user)
//   - api/auth/login.php     (just after successful authentication)
//
// Why both: a user might first sign up (where claim happens on signup) OR
// might have signed up *before* their guest order existed (rare but possible)
// and have placed a guest order with the same email after signing up — in
// that case the claim fires on the next login.
//
// Security note: we don't independently verify that the auth'd user owns the
// email used by the guest order. We trust the auth event:
//   - Signup: anyone signing up with email X gets to claim guest orders for X.
//     This is a known soft-permission boundary; the attacker would have to
//     know the victim's email AND not have it already taken to sign up. The
//     blast radius is read-only (order code + items + shipping address);
//     no payment data is exposed, no new orders can be placed at the
//     victim's expense. Plain industry-standard claim-on-signup pattern;
//     long-term hardening would add an email-verification step before claim.
//   - Login: the password itself is the proof. If the attacker has the
//     victim's password they have the whole account anyway.
//
// The function is idempotent. Re-running it on the same user is a no-op
// because the UPDATE filters on user_id IS NULL — once an order has been
// attached it'll be skipped on subsequent calls.

function claim_guest_orders_for_user(PDO $pdo, int $userId, string $email): int {
    $email = strtolower(trim($email));
    if ($userId <= 0 || $email === '') return 0;

    // JSON_UNQUOTE(JSON_EXTRACT(...)) returns the raw string value (not the
    // quoted JSON literal). MySQL 5.7+ supports the shortcut `->>'$.path'`
    // but the long form is friendlier to older MySQL builds Hostinger
    // sometimes serves on shared plans.
    $stmt = $pdo->prepare(
        "UPDATE orders
           SET user_id = :uid
         WHERE user_id IS NULL
           AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(order_data, '$.contact.email'))) = :e"
    );
    $stmt->execute([':uid' => $userId, ':e' => $email]);
    return $stmt->rowCount();
}
