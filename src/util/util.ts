export function equals(obj1: unknown, obj2: unknown): boolean {
  function isObject(object: unknown): object is Record<string, unknown> {
    return object != null && typeof object === "object";
    //return object instanceof Object && object.constructor === Object; // This is less reliable
  }

  if (obj1 === undefined || obj2 === undefined) {
    return false;
  }

  if (!isObject(obj1) || !isObject(obj2)) {
    return obj1 === obj2;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (!Object.prototype.hasOwnProperty.call(obj2, key)) {
      return false;
    }

    const val1 = obj1[key];
    const val2 = obj2[key];
    const areObjects = isObject(val1) && isObject(val2);

    if (areObjects && !equals(val1, val2)) {
      return false;
    }
    if (!areObjects && val1 !== val2) {
      return false;
    }
  }

  return true;
}

export async function loadInfoJson(id: URL) {
  let url: string;

  if (!id.toString().endsWith("/info.json")) {
    if (!id.toString().endsWith("/")) {
      url = id.toString() + "/info.json";
    } else {
      url = id.toString() + "info.json";
    }
  } else {
    url = id.toString();
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Response status: ${response.status}`);
  }
  return await response.json();
}
