import { NextRequest, NextResponse } from "next/server";

// The deployed URL can spend API credit, so APP_PASSWORD puts it behind HTTP basic auth (any username).
export function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const header = req.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Basic ") ? atob(header.slice(6)).split(":").slice(1).join(":") : null;
  if (supplied === password) return NextResponse.next();
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Searchlight"' },
  });
}

export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
