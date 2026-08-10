import { useEffect, useRef } from "react";
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Props = { value: string; onChange: (html: string) => void };

export function RichTextEditor({ value, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML ?? "");
  };

  const insertCode = () => {
    ref.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      '<pre class="wiki-code"><code>código aquí</code></pre><p><br/></p>',
    );
    onChange(ref.current?.innerHTML ?? "");
  };

  const tools = [
    { icon: Heading1, label: "Título 1", run: () => exec("formatBlock", "<h1>") },
    { icon: Heading2, label: "Título 2", run: () => exec("formatBlock", "<h2>") },
    { icon: Heading3, label: "Título 3", run: () => exec("formatBlock", "<h3>") },
    { icon: Bold, label: "Negrita", run: () => exec("bold") },
    { icon: Italic, label: "Cursiva", run: () => exec("italic") },
    { icon: Underline, label: "Subrayado", run: () => exec("underline") },
    { icon: List, label: "Lista", run: () => exec("insertUnorderedList") },
    { icon: ListOrdered, label: "Lista numerada", run: () => exec("insertOrderedList") },
    { icon: Quote, label: "Cita", run: () => exec("formatBlock", "<blockquote>") },
    { icon: Code2, label: "Bloque de código", run: insertCode },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 p-2">
        {tools.map((t) => (
          <Button
            key={t.label}
            type="button"
            size="icon"
            variant="ghost"
            title={t.label}
            className="size-8"
            onMouseDown={(e) => e.preventDefault()}
            onClick={t.run}
          >
            <t.icon className="size-4" />
          </Button>
        ))}
        <Separator orientation="vertical" className="mx-1 h-6" />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          title="Deshacer"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("undo")}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          title="Rehacer"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("redo")}
        >
          <Redo2 className="size-4" />
        </Button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="wiki-content min-h-[280px] w-full px-4 py-3 text-sm outline-none"
      />
    </div>
  );
}
