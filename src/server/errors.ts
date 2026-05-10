import { captureError } from "@/server/observability";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "bad_request",
  ) {
    super(message);
  }
}

export class AuthRequiredError extends AppError {
  constructor() {
    super("Authentication is required.", 401, "auth_required");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403, "forbidden");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.") {
    super(message, 404, "not_found");
  }
}

export function toErrorResponse(error: unknown, context: Record<string, unknown> = {}) {
  if (error instanceof AppError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  captureError(error, { ...context, source: "toErrorResponse" });
  return Response.json(
    {
      error: {
        code: "internal_error",
        message: error instanceof Error ? error.message : "Unexpected error.",
      },
    },
    { status: 500 },
  );
}
