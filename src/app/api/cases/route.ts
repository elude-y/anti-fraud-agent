import { NextResponse } from "next/server";
import { demoCases } from "@/lib/demo-data";

export function GET() {
  return NextResponse.json({
    items: demoCases,
    total: demoCases.length,
  });
}
