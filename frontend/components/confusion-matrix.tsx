import { ScrollX } from "@/components/ui/scroll-x";
import { trajectoryLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ConfusionMatrix({
  classes,
  matrix,
  caption,
}: {
  classes: string[];
  matrix: number[][];
  caption?: string;
}) {
  const maxVal = Math.max(1, ...matrix.flat());

  return (
    <ScrollX>
      <table className="ua-matrix">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            <th scope="col" className="text-left text-[12px] font-semibold text-ink-3">
              Aktual \ Prediksi
            </th>
            {classes.map((c) => (
              <th key={c} scope="col" className="text-[12px] font-bold">
                {trajectoryLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, ri) => {
            const rowSum = row.reduce((a, b) => a + b, 0);
            return (
              <tr key={classes[ri]}>
                <th scope="row" className="text-left text-[13px] font-bold">
                  {trajectoryLabel(classes[ri])}
                </th>
                {row.map((val, ci) => {
                  const isDiag = ri === ci;
                  const ratio = val / maxVal;
                  const pct = rowSum > 0 ? ((val / rowSum) * 100).toFixed(0) : "0";
                  return (
                    <td
                      key={classes[ci]}
                      className={cn(isDiag && "is-diag")}
                      style={
                        isDiag
                          ? {
                              background: `color-mix(in srgb, var(--series-1) ${Math.round(14 + ratio * 30)}%, transparent)`,
                            }
                          : val > 0
                            ? {
                                background: `color-mix(in srgb, var(--series-2) ${Math.round(6 + ratio * 22)}%, transparent)`,
                              }
                            : undefined
                      }
                    >
                      <span className="block font-bold">{val}</span>
                      <span className="block text-[11px] font-normal text-ink-3">{pct}%</span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollX>
  );
}
