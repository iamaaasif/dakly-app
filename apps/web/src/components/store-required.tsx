// Shown only when a shop was selected before and access to every shop has since gone.
export function StoreRequired() {
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-bold">Choose a shop</h1>
      <p>Choose an existing shop above to continue.</p>
    </div>
  );
}
