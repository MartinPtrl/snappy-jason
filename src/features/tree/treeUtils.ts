export const getValueAtPointer = (data: any, pointer: string): any => {
  if (!pointer || pointer === "") return data;

  const parts = pointer.split("/").filter((part) => part !== "");
  let current = data;

  for (const part of parts) {
    if (current === null || current === undefined) return null;

    if (Array.isArray(current)) {
      const index = parseInt(part);
      current = current[index];
    } else if (typeof current === "object") {
      current = current[part];
    } else {
      return null;
    }
  }

  return current;
};
