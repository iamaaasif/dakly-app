import { useState } from 'react';

import type { AreaResponse } from '@dakly/contracts/delivery';

import { useOrderAreas } from '../api/get-areas';

export function OrderAreaFields({ onChange }: { onChange: (id: number | undefined) => void }) {
  const [division, setDivision] = useState(0);
  const [district, setDistrict] = useState(0);
  const [upazila, setUpazila] = useState(0);
  const divisions = useOrderAreas();
  const districts = useOrderAreas(division);
  const upazilas = useOrderAreas(district);
  const error = divisions.error ?? districts.error ?? upazilas.error;

  return (
    <>
      <AreaSelect
        label="Division"
        items={divisions.data?.items}
        value={division}
        onChange={(id) => {
          setDivision(id);
          setDistrict(0);
          setUpazila(0);
          onChange(undefined);
        }}
      />
      <AreaSelect
        label="District"
        items={districts.data?.items}
        value={district}
        onChange={(id) => {
          setDistrict(id);
          setUpazila(0);
          onChange(id || undefined);
        }}
      />
      {upazilas.data?.items.length ? (
        <AreaSelect
          label="Upazila"
          items={upazilas.data.items}
          value={upazila}
          onChange={(id) => {
            setUpazila(id);
            onChange(id || district);
          }}
        />
      ) : null}
      {error && (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      )}
    </>
  );
}

function AreaSelect({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items?: AreaResponse[];
  value: number;
  onChange: (id: number) => void;
}) {
  return (
    <label>
      {label}
      <select
        className="min-h-10 w-full rounded-md border border-input-border bg-surface px-2"
        value={value}
        disabled={!items?.length}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        <option value={0}>{`Choose ${label.toLowerCase()}`}</option>
        {items?.map((area) => (
          <option key={area.id} value={area.id}>
            {area.name}
          </option>
        ))}
      </select>
    </label>
  );
}
