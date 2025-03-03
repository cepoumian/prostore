"use server";

import { cookies } from "next/headers";
import { CartItem } from "@/types";
import { convertToPlainObject, formatError, round2 } from "../utils";
import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { cartItemSchema, insertCartSchema } from "../validators";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

// Calculate cart prices
const calcPrice = (items: CartItem[]) => {
  const itemsPrice = round2(
      items.reduce((acc, item) => acc + Number(item.price) * item.qty, 0)
    ),
    shippingPrice = round2(itemsPrice > 100 ? 0 : 10),
    taxPrice = round2(0.15 * itemsPrice),
    totalPrice = round2(itemsPrice + shippingPrice + taxPrice);

  return {
    itemsPrice: itemsPrice.toFixed(2),
    shippingPrice: shippingPrice.toFixed(2),
    taxPrice: taxPrice.toFixed(2),
    totalPrice: totalPrice.toFixed(2),
  };
};

export async function addItemToCart(data: CartItem) {
  try {
    // Check for the cart cookie
    const sessionCartId = (await cookies()).get("sessionCartId")?.value;

    if (!sessionCartId) throw new Error("Cart session  not found");

    // Get session and user id
    const session = await auth();
    const userId = session?.user?.id ? (session.user.id as string) : undefined;

    // Get cart
    const cart = await getMyCart();

    // Parse and validate item
    const item = cartItemSchema.parse(data);

    // Find product in db
    const product = await prisma.product.findFirst({
      where: { id: item.productId },
    });

    if (!product) throw new Error("Product not found");

    if (!cart) {
      // Create new cart
      const newCart = insertCartSchema.parse({
        userId: userId,
        items: [item],
        sessionCartId: sessionCartId,
        ...calcPrice([item]),
      });
      // Add cart to db
      await prisma.cart.create({ data: newCart });
      // Revalidate product page
      revalidatePath(`/product/${product.slug}`);

      return {
        success: true,
        message: `${product.name} added to cart`,
      };
    } else {
      // Check if item is already in cart
      const existingItem = (cart.items as CartItem[]).find(
        (i) => i.productId === item.productId
      );

      if (existingItem) {
        // Check the stock
        if (product.stock < existingItem.qty + 1) {
          throw new Error("Not enough stock");
        }
        // Increase the quantity
        (cart.items as CartItem[]).find(
          (i) => i.productId === item.productId
        )!.qty = existingItem.qty + 1;
      } else {
        // If item is not in cart, add it
        // Check stock
        if (product.stock < 1) {
          throw new Error("Not enough stock");
        }
        // Add item to cart.items
        cart.items.push(item);
      }
      // Save cart to db
      await prisma.cart.update({
        where: { id: cart.id },
        data: {
          items: cart.items as Prisma.CartUpdateitemsInput[],
          ...calcPrice(cart.items),
        },
      });
      revalidatePath(`/product/${product.slug}`);
      return {
        success: true,
        message: `${product.name} ${
          existingItem ? "updated in" : "added to"
        } cart`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: formatError(error),
    };
  }
}

export async function getMyCart() {
  // Check for the cart cookie
  const sessionCartId = (await cookies()).get("sessionCartId")?.value;

  if (!sessionCartId) throw new Error("Cart session  not found");

  // Get session and user id
  const session = await auth();
  const userId = session?.user?.id ? (session.user.id as string) : undefined;

  // Get user cart from db
  const cart = await prisma.cart.findFirst({
    where: userId ? { userId } : { sessionCartId },
  });

  if (!cart) {
    return undefined;
  }

  // Convert decimals to string and return plain object
  return convertToPlainObject({
    ...cart,
    items: cart.items as CartItem[],
    itemsPrice: cart.itemsPrice.toString(),
    totalPrice: cart.totalPrice.toString(),
    shippingPrice: cart.shippingPrice.toString(),
    taxPrice: cart.taxPrice.toString(),
  });
}

export async function removeItemFromCart(productId: string) {
  try {
    // Check for the cart cookie
    const sessionCartId = (await cookies()).get("sessionCartId")?.value;
    if (!sessionCartId) throw new Error("Cart session  not found");

    // Get product
    const product = await prisma.product.findFirst({
      where: { id: productId },
    });
    if (!product) throw new Error("Product not found");

    // Get user cart
    const cart = await getMyCart();
    if (!cart) throw new Error("Cart not found");

    // Check if item is in cart
    const existingItem = (cart.items as CartItem[]).find(
      (i) => i.productId === productId
    );
    if (!existingItem) throw new Error("Item not found in cart");

    // Check if item is the only one in cart
    if (existingItem.qty === 1) {
      // Remove item from cart
      cart.items = (cart.items as CartItem[]).filter(
        (i) => i.productId !== existingItem.productId
      );
    } else {
      // Decrease item quantity
      (cart.items as CartItem[]).find((i) => i.productId === productId)!.qty =
        existingItem.qty - 1;
    }

    // Update cart in db
    await prisma.cart.update({
      where: { id: cart.id },
      data: {
        items: cart.items as Prisma.CartUpdateitemsInput[],
        ...calcPrice(cart.items),
      },
    });

    revalidatePath(`/product/${product.slug}`);
    return {
      success: true,
      message: `${product.name} removed from cart`,
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
