import { generateAccessToken, paypal } from "../lib/paypal";

// Test to generate access token from paypal
test("Generate PayPal access token", async () => {
  const token = await generateAccessToken();
  console.log("PayPal Access Token:", token);
  expect(token).toBeDefined();
  expect(typeof token).toBe("string");
  expect(token.length).toBeGreaterThan(0);
});

// Test to create a PayPal order
test("Creates a PayPal order", async () => {
  // const token = await generateAccessToken();
  const price = 10.0;
  const orderResponse = await paypal.createOrder(price);
  console.log("PayPal Order Response:", orderResponse);
  expect(orderResponse).toHaveProperty("id");
  expect(orderResponse).toHaveProperty("status");
  expect(orderResponse.status).toBe("CREATED");
});

// Capture payment with a mock order
test("Simulate capturing a payment from an order", async () => {
  const orderId = "100";
  const mockCapturePayment = jest
    .spyOn(paypal, "capturePayment")
    .mockResolvedValue({
      status: "COMPLETED",
    });

  const captureResponse = await paypal.capturePayment(orderId);
  expect(captureResponse).toHaveProperty("status");
  expect(captureResponse.status).toBe("COMPLETED");

  // Clean up the mock
  mockCapturePayment.mockRestore();
});
