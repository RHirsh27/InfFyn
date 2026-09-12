import "server-only";
import { NextResponse } from "next/server";
import {
  alphaRouteDisabled,
  alphaUserAllowed,
  parseAlphaPolicy,
} from "./alpha-policy";

export function privateAlphaPolicy() {
  return parseAlphaPolicy(
    process.env.INFFYN_PRIVATE_ALPHA,
    process.env.INFFYN_ALPHA_USER_IDS,
    process.env.INFFYN_RELEASE_STAGE,
  );
}

export function releaseStage(): "private_alpha" | "standard" {
  return privateAlphaPolicy().enabled ? "private_alpha" : "standard";
}

export function requireAlphaUser(user: Parameters<typeof alphaUserAllowed>[1]) {
  if (!alphaUserAllowed(privateAlphaPolicy(), user))
    throw new AlphaAccessError();
}

export class AlphaAccessError extends Error {
  constructor() {
    super("This account does not have private-alpha access.");
  }
}

export function alphaDisabledResponse(path: string, method = "POST") {
  if (!privateAlphaPolicy().enabled || !alphaRouteDisabled(path, method))
    return null;
  return NextResponse.json(
    {
      detail:
        "This action is unavailable in the private alpha. Use the monthly CSV workspace.",
    },
    {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
