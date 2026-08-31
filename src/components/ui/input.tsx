import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background/60 px-3 py-1 text-base shadow-xs transition-[color,background-color,border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/70 hover:border-input/70 focus-visible:border-ring focus-visible:bg-background focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/25 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
