import type { Node } from "@/shared/types";

export const createNodesFromJSON = (
  data: any,
  parentPointer: string = ""
): Node[] => {
  const nodes: Node[] = [];

  if (typeof data === "object" && data !== null) {
    if (Array.isArray(data)) {
      data.slice(0, 200).forEach((item, index) => {
        const pointer = `${parentPointer}/${index}`;
        const node = createNodeFromValue(index.toString(), item, pointer);
        nodes.push(node);
      });
    } else {
      Object.entries(data)
        .slice(0, 200)
        .forEach(([key, value]) => {
          const pointer = `${parentPointer}/${key}`;
          const node = createNodeFromValue(key, value, pointer);
          nodes.push(node);
        });
    }
  }

  return nodes;
};

export const createNodeFromValue = (
  key: string,
  value: any,
  pointer: string
): Node => {
  let valueType: string;
  let hasChildren: boolean;
  let childCount: number;
  let preview: string;

  if (value === null) {
    valueType = "null";
    hasChildren = false;
    childCount = 0;
    preview = "null";
  } else if (typeof value === "boolean") {
    valueType = "boolean";
    hasChildren = false;
    childCount = 0;
    preview = value.toString();
  } else if (typeof value === "number") {
    valueType = "number";
    hasChildren = false;
    childCount = 0;
    preview = value.toString();
  } else if (typeof value === "string") {
    valueType = "string";
    hasChildren = false;
    childCount = 0;
    preview = value.length > 120 ? `${value.substring(0, 120)}…` : value;
  } else if (Array.isArray(value)) {
    valueType = "array";
    hasChildren = value.length > 0;
    childCount = value.length;
    preview = `[…] ${value.length} items`;
  } else if (typeof value === "object") {
    const keys = Object.keys(value);
    valueType = "object";
    hasChildren = keys.length > 0;
    childCount = keys.length;
    preview = `{…} ${keys.length} keys`;
  } else {
    valueType = typeof value;
    hasChildren = false;
    childCount = 0;
    preview = String(value);
  }

  return {
    pointer,
    key,
    value_type: valueType,
    has_children: hasChildren,
    child_count: childCount,
    preview,
  };
};

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
