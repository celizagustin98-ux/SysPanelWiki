import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-background/60 px-3 py-2 text-base leading-relaxed shadow-xs transition-[color,background-color,border-color,box-shadow] placeholder:text-muted-foreground/70 hover:border-input/70 focus-visible:border-ring focus-visible:bg-background focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/25 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
