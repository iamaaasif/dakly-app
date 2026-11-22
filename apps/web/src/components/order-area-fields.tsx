import { useState } from 'react';

import type { AreaResponse } from '@dakly/contracts/delivery';
import { FormField } from '@dakly/ui/form-field';

import { useOrderAreas } from '@/lib/order-entry/get-areas';

export function OrderAreaFields({
  currentDistrict,
  onChange,
}: {
  currentDistrict?: string;
  onChange: (id: number | undefined) => void;
}) {
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
        name="division"
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
        name="recipient.areaId"
        label="District"
        items={districts.data?.items}
        value={district}
        current={division ? undefined : currentDistrict}
        onChange={(id) => {
          setDistrict(id);
          setUpazila(0);
          onChange(id || undefined);
        }}
      />
      <UpazilaSelect
        upazilas={upazilas.data?.items}
        district={districts.data?.items.find(({ id }) => id === district)}
        value={upazila}
        onChange={(id) => {
          setUpazila(id);
          onChange(id || district);
        }}
      />
      {error && (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      )}
    </>
  );
}

function UpazilaSelect({
  upazilas,
  district,
  value,
  onChange,
}: {
  upazilas?: AreaResponse[];
  district?: AreaResponse;
  value: number;
  onChange: (id: number) => void;
}) {
  if (!upazilas?.length) return null;
  return (
    <AreaSelect
      name="upazila"
      label="Upazila"
      items={upazilas}
      emptyLabel={wholeDistrictLabel(district)}
      value={value}
      onChange={onChange}
    />
  );
}

// The upazila list holds only the suburbs, so the empty choice is the city itself and must say so.
function wholeDistrictLabel(district?: AreaResponse) {
  if (district?.name === 'Dhaka') return 'Dhaka city';
  return district ? `Rest of ${district.name}` : 'Choose upazila';
}

function AreaSelect({
  name,
  label,
  items,
  emptyLabel,
  value,
  current,
  onChange,
}: {
  name: string;
  label: string;
  items?: AreaResponse[];
  emptyLabel?: string;
  value: number;
  current?: string;
  onChange: (id: number) => void;
}) {
  return (
    <FormField name={name} label={label}>
      {(props) => (
        <select
          {...props}
          className="min-h-10 w-full rounded-md border border-input-border bg-surface px-2 aria-invalid:border-danger"
          value={value}
          disabled={!items?.length}
          onChange={(event) => onChange(Number(event.target.value))}
        >
          <option value={0}>{current ?? emptyLabel ?? `Choose ${label.toLowerCase()}`}</option>
          {items?.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}
