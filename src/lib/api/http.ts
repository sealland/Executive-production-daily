import { NextResponse } from "next/server";
import { parseFilters } from "@/lib/query/productionFilters";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 500, error?: unknown) {
  return NextResponse.json(
    {
      message,
      error: error instanceof Error ? error.message : undefined
    },
    { status }
  );
}

export function filtersFromRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  return parseFilters(searchParams);
}
