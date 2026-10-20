import { forwardRef, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Campo de contraseña con el "ojito" para ver lo que se escribe. */
export const InputClave = forwardRef<HTMLInputElement, Omit<ComponentProps<typeof Input>, "type">>(
  function InputClave({ className, ...props }, ref) {
    const [ver, setVer] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={ver ? "text" : "password"}
          className={cn("pr-10", className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVer((v) => !v)}
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
          title={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  },
);
