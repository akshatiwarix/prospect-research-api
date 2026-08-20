"use client";

import type { Directory } from "./types";

/**
 * The matrix, and the reason it is the first thing on the page.
 *
 * Every enrichment vendor knows which accounts it covers and none of them will
 * show you, because the answer is sparse and sparse looks bad. So callers learn
 * coverage empirically, one disappointing account at a time, and end up with
 * folklore instead of a table. This is the table.
 *
 * Real companies cap at 2-of-6 and the row colouring does not hide it. The cause
 * is stated rather than implied: binding the other four capabilities would mean
 * this repo publishing authored evidence about an identifiable firm.
 */
export function CoverageMatrix({
  directory,
  selected,
  onSelect,
}: {
  directory: Directory;
  selected: string;
  onSelect: (canonicalId: string) => void;
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500 dark:bg-neutral-950">
              company
            </th>
            {directory.capabilities.map((capability) => (
              <th
                key={capability.id}
                title={`${capability.upstream} — ${capability.shipped_by}`}
                className="px-2 py-2 text-center font-mono text-[10px] font-normal text-neutral-500"
              >
                {capability.id.replace("_", " ")}
              </th>
            ))}
            <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              of 6
            </th>
          </tr>
        </thead>
        <tbody>
          {directory.companies.map((company) => {
            const isSelected = company.canonical_id === selected;
            return (
              <tr
                key={company.canonical_id}
                onClick={() => onSelect(company.canonical_id)}
                className={`cursor-pointer border-t border-neutral-100 dark:border-neutral-900 ${
                  isSelected ? "bg-sky-500/10" : "hover:bg-neutral-500/5"
                }`}
              >
                <td className="sticky left-0 z-10 bg-inherit px-3 py-1.5">
                  <span className="font-mono text-[11px]">{company.canonical_id}</span>
                  {company.origin === "real" && (
                    <span
                      title="A real company. This repo will not author evidence about it, which is why signals is unbound."
                      className="ml-1.5 rounded bg-neutral-500/10 px-1 font-mono text-[9px] text-neutral-500"
                    >
                      real
                    </span>
                  )}
                </td>
                {directory.capabilities.map((capability) => (
                  <td key={capability.id} className="px-2 py-1.5 text-center font-mono text-[11px]">
                    {company.bound[capability.id] ? (
                      <span className="text-emerald-600 dark:text-emerald-400">bound</span>
                    ) : (
                      <span className="text-neutral-300 dark:text-neutral-700">—</span>
                    )}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-mono text-[11px] text-neutral-500">
                  {company.bound_count}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
