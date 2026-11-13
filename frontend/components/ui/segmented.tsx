import { Slide } from "@/components/ui/slide";

/** Pilihan tampilan 2–4 opsi yang saling eksklusif (lebih dari 4: pakai dropdown). Gaya tab bergaris bawah. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <Slide className="ua-tabs" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </Slide>
  );
}
