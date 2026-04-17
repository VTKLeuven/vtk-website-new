"use client";

import { useState, useTransition } from "react";
import { Button, Textarea } from "@vtk/ui";
import { bulkImportUsersAction } from "@/app/actions/users-groups";

export function BulkImport({ locale }: { locale: "nl" | "en" }) {
  const [csv, setCsv] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ added: number; errors: string[] } | null>(null);

  return (
    <form
      action={(fd) => {
        fd.set("csv", csv);
        startTransition(async () => {
          const r = await bulkImportUsersAction(fd);
          setResult(r);
        });
      }}
      className="space-y-3"
    >
      <Textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={8}
        placeholder={"email,name,password,groupCode,role,year\njane@vtk.be,Jane Doe,changeme,IT,MEMBER,2026"}
      />
      <Button type="submit" disabled={pending || csv.trim().length === 0}>
        {pending ? "..." : locale === "nl" ? "Importeren" : "Import"}
      </Button>
      {result && (
        <div className="text-sm">
          <p className="font-medium">
            {locale === "nl" ? "Toegevoegd" : "Added"}: {result.added}
          </p>
          {result.errors.length > 0 && (
            <ul className="list-disc pl-5 text-red-600">
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
