import { expect,it } from "vitest"; import { csv } from "@/lib/exports/csv"; it("exports visible rows safely",()=>expect(csv(["Title"],[["A, Book"]])).toBe('"Title"\n"A, Book"'));
