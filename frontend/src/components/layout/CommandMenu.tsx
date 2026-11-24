import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { FileStack, FolderKanban, ListChecks, Loader2, ScrollText, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";

const PAGES = [
  ["Dashboard", "/"],
  ["Projects", "/projects"],
  ["Documents", "/documents"],
  ["Requirements", "/requirements"],
  ["Change Analysis", "/changes"],
  ["Test Cases", "/test-cases"],
  ["Traceability", "/traceability"],
  ["Reports", "/reports"],
  ["Settings", "/settings"],
] as const;

function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const navigate = useNavigate();
  const { data, isFetching } = useQuery({
    queryKey: ["search", query],
    queryFn: () => api.search(query),
    enabled: open && query.length >= 2,
  });

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  const group = (heading: string, icon: ReactNode, items: { id: number; title: string; subtitle: string }[] | undefined, to: (id: number) => string) =>
    items && items.length > 0 ? (
      <Command.Group heading={heading}>
        {items.map((it) => (
          <Item key={`${heading}-${it.id}`} value={`${heading}-${it.id}-${it.title}`} onSelect={() => go(to(it.id))} icon={icon}>
            <span className="truncate">{it.title}</span>
            <span className="ml-auto shrink-0 pl-3 text-xs capitalize text-ink-3">{it.subtitle}</span>
          </Item>
        ))}
      </Command.Group>
    ) : null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[hsl(222_40%_8%/0.4)] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border bg-surface shadow-pop data-[state=open]:animate-zoom-in">
          <DialogPrimitive.Title className="sr-only">Search SpecLens</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search projects, documents, requirements and test cases</DialogPrimitive.Description>
          <Command shouldFilter={false} label="Search">
            <div className="flex items-center gap-2 border-b px-4">
              <Search className="h-4 w-4 text-ink-3" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search requirements, tests, documents or jump to a page"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
              />
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-ink-3" />}
            </div>
            <Command.List className="scrollbar-thin max-h-[52vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-3">
              {query.length >= 2 && data && (
                <>
                  {Object.values(data).every((arr) => arr.length === 0) && (
                    <div className="px-3 py-8 text-center text-[13px] text-ink-2">No matches for “{query}”.</div>
                  )}
                  {group("Requirements", <ScrollText />, data.requirements, (id) => `/requirements?focus=${id}`)}
                  {group("Test cases", <ListChecks />, data.test_cases, (id) => `/test-cases?focus=${id}`)}
                  {group("Documents", <FileStack />, data.documents, (id) => `/documents/${id}`)}
                  {group("Projects", <FolderKanban />, data.projects, (id) => `/projects/${id}`)}
                </>
              )}
              {query.length < 2 && (
                <Command.Group heading="Go to">
                  {PAGES.map(([label, to]) => (
                    <Item key={to} value={label} onSelect={() => go(to)}>
                      {label}
                    </Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Item({ children, onSelect, value, icon }: { children: ReactNode; onSelect: () => void; value: string; icon?: ReactNode }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink data-[selected=true]:bg-brand-soft data-[selected=true]:text-brand-ink [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-ink-3"
    >
      {icon}
      {children}
    </Command.Item>
  );
}
