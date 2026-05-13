# Secure Checkout Validations & Razorpay Integration

The goal is to implement robust frontend validations on the custom "Velorex Music Payment Gateway" UI, and then seamlessly hand off the actual transaction processing to Razorpay.

## Proposed Changes

### `index.html`
- **Include Razorpay SDK:** Add `<script src="https://checkout.razorpay.com/v1/checkout.js"></script>` to the `<head>` of the HTML.
- **Add Input IDs:** Add ID attributes to the custom checkout form inputs (Card Number, Expiry, CVV, UPI ID) so they can be validated via JavaScript.
- **Implement Validations:** Inside the `processPayment()` function, add validation logic based on the selected payment method:
  - **Card:** Verify a 16-digit numeric pattern, MM/YY expiry pattern, and 3-digit CVV.
  - **UPI:** Verify basic UPI format (`string@bank`).
  - *If validations fail, we will show an error toast and stop execution.*
- **Integrate Razorpay Flow:** Once validations pass, instead of a dummy timeout, we will initialize Razorpay using a Test Key (`rzp_test_...`). 
  - The Razorpay overlay will appear to complete the payment.
  - On the `handler` success callback from Razorpay, we will capture the Payment ID, generate the Velorex Order ID, clear the cart, and navigate to the user profile.

> [!WARNING] 
> **Important Note on Razorpay Custom UIs**
> Typically, Razorpay recommends using their standard checkout overlay instead of capturing card details in a custom UI to avoid PCI compliance requirements. In this plan, we will validate your custom UI for aesthetic purposes, but still trigger Razorpay's secure standard overlay to process the actual payment safely.

## User Review Required

Does this approach work for you? We will use a **Razorpay Test Key** for now. Once you are ready for production, you can simply swap it out for your Live Key in the code. Let me know if you approve this plan or if you'd like to completely replace the custom UI with Razorpay's standard button.
