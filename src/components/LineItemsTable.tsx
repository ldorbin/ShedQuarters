import { useState } from "react";
import { formatMoney } from "../../shared/format";
import { lineTotalPence } from "../../shared/totals";
import type { LineItem, LineItemType, LineItemUnit } from "../../shared/types";
import { LINE_ITEM_UNITS } from "../../shared/types";
import { PlusIcon, TrashIcon } from "./Icons";
import { MoneyInput } from "./MoneyInput";

const TYPE_OPTIONS: { value: LineItemType; label: string }[] = [
  { value: "labour", label: "Labour" },
  { value: "part", label: "Part" },
  { value: "other", label: "Other" },
];

export function newLineItem(type: LineItemType, unitPricePence = 0): LineItem {
  return {
    id: crypto.randomUUID(),
    type,
    description: "",
    partNumber: "",
    quantity: 1,
    unit: type === "labour" ? "hrs" : "each",
    unitPricePence,
    taxable: true,
  };
}

export function LineItemsTable({
  items,
  onChange,
  showTaxable,
  defaultLabourRatePence,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  showTaxable: boolean;
  defaultLabourRatePence: number;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<LineItem>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const remove = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const next = [...items];
    const fromIndex = next.findIndex((item) => item.id === fromId);
    const toIndex = next.findIndex((item) => item.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next);
  };

  return (
    <div>
      <div className="table-wrap">
        <table className="items-table">
          <thead>
            <tr>
              <th className="col-drag" />
              <th className="col-type">Type</th>
              <th>Description</th>
              <th className="col-qty">Qty</th>
              <th className="col-unit">Unit</th>
              <th className="col-price">Unit price</th>
              {showTaxable && <th className="col-unit">VAT</th>}
              <th className="col-total num">Total</th>
              <th className="col-remove" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={`items-row${draggingId === item.id ? " dragging" : ""}${
                  dropTargetId === item.id ? " drop-target" : ""
                }`}
                draggable={draggingId === item.id}
                onDragOver={(event) => {
                  if (!draggingId) return;
                  event.preventDefault();
                  setDropTargetId(item.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingId) reorder(draggingId, item.id);
                  setDraggingId(null);
                  setDropTargetId(null);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDropTargetId(null);
                }}
              >
                <td className="col-drag">
                  <button
                    type="button"
                    className="drag-handle"
                    aria-label="Drag to reorder"
                    onMouseDown={() => setDraggingId(item.id)}
                    onTouchStart={() => setDraggingId(item.id)}
                  >
                    ⠿
                  </button>
                </td>

                <td data-label="Type">
                  <select
                    aria-label="Line type"
                    value={item.type}
                    onChange={(event) => {
                      const type = event.target.value as LineItemType;
                      update(item.id, {
                        type,
                        unit: type === "labour" ? "hrs" : item.unit,
                        unitPricePence:
                          type === "labour" && item.unitPricePence === 0
                            ? defaultLabourRatePence
                            : item.unitPricePence,
                      });
                    }}
                  >
                    {TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>

                <td data-label="Description">
                  <input
                    type="text"
                    aria-label="Description"
                    placeholder={
                      item.type === "part" ? "e.g. Front brake pads" : "e.g. Replace front pads"
                    }
                    value={item.description}
                    onChange={(event) => update(item.id, { description: event.target.value })}
                  />
                  {item.type === "part" && (
                    <input
                      type="text"
                      aria-label="Part number"
                      placeholder="Part number (optional)"
                      value={item.partNumber}
                      style={{ marginTop: 4 }}
                      onChange={(event) => update(item.id, { partNumber: event.target.value })}
                    />
                  )}
                </td>

                <td data-label="Qty">
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    aria-label="Quantity"
                    value={Number.isFinite(item.quantity) ? item.quantity : 0}
                    onChange={(event) =>
                      update(item.id, { quantity: Number.parseFloat(event.target.value) || 0 })
                    }
                  />
                </td>

                <td data-label="Unit">
                  <select
                    aria-label="Unit"
                    value={item.unit}
                    onChange={(event) =>
                      update(item.id, { unit: event.target.value as LineItemUnit })
                    }
                  >
                    {LINE_ITEM_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </td>

                <td data-label="Unit price">
                  <MoneyInput
                    ariaLabel="Unit price"
                    valuePence={item.unitPricePence}
                    onChange={(pence) => update(item.id, { unitPricePence: pence })}
                  />
                </td>

                {showTaxable && (
                  <td data-label="VAT">
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={item.taxable}
                        onChange={(event) => update(item.id, { taxable: event.target.checked })}
                      />
                      <span className="sr-only">Charge VAT on this line</span>
                    </label>
                  </td>
                )}

                <td data-label="Total" className="num">
                  <span className="line-total">{formatMoney(lineTotalPence(item))}</span>
                </td>

                <td className="col-remove">
                  <button
                    type="button"
                    className="btn btn-icon btn-ghost btn-danger"
                    aria-label="Remove line"
                    onClick={() => remove(item.id)}
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}

            {items.length === 0 && (
              <tr>
                <td colSpan={showTaxable ? 9 : 8}>
                  <p className="faint" style={{ padding: "18px 4px", margin: 0 }}>
                    No lines yet — add the labour and parts for this job below.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onChange([...items, newLineItem("labour", defaultLabourRatePence)])}
        >
          <PlusIcon />
          Add labour
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onChange([...items, newLineItem("part")])}
        >
          <PlusIcon />
          Add part
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onChange([...items, newLineItem("other")])}
        >
          <PlusIcon />
          Add other
        </button>
      </div>
    </div>
  );
}
