// poly.ts is based on basic.ts
import { error, parseBasic, parsePoly, typeShow } from "npm:tiny-ts-parser";

type Term =
    | { tag: "true" }
    | { tag: "false" }
    | { tag: "if"; cond: Term; thn: Term; els: Term }
    | { tag: "number"; n: number }
    | { tag: "add"; left: Term; right: Term }
    | { tag: "var"; name: string }
    | { tag: "func"; params: Param[]; body: Term }
    | { tag: "call"; func: Term; args: Term[] }
    | { tag: "seq"; body: Term; rest: Term }
    | { tag: "const"; name: string; init: Term; rest: Term }
    | { tag: "typeAbs"; typeParams: string[]; body: Term }
    | { tag: "typeApp"; typeAbs: Term; typeArgs: Type[] };

type Param = { name: string; type: Type };

type Type =
    | { tag: "Boolean" }
    | { tag: "Number" }
    | { tag: "Func"; params: Param[]; retType: Type }
    | { tag: "TypeAbs"; typeParams: string[]; type: Type }
    | { tag: "TypeVar"; name: string };

type TypeEnv = Record<string, Type>;

function typecheck(t: Term, tyEnv: TypeEnv, tyVars: string[]): Type {
    switch (t.tag) {
        case "true":
            return { tag: "Boolean" };
        case "false":
            return { tag: "Boolean" };
        case "if": {
            const condTy = typecheck(t.cond, tyEnv, tyVars);
            if (condTy.tag !== "Boolean") error("boolean expected", t.cond);
            const thnTy = typecheck(t.thn, tyEnv, tyVars);
            const elsTy = typecheck(t.els, tyEnv, tyVars);
            if (!typeEq(thnTy, elsTy, tyVars)) {
                error("then and else have different types", t);
            }
            return thnTy;
        }
        case "number":
            return { tag: "Number" };
        case "add": {
            const leftTy = typecheck(t.left, tyEnv, tyVars);
            if (leftTy.tag !== "Number") error("number expected", t.left);
            const rightTy = typecheck(t.right, tyEnv, tyVars);
            if (rightTy.tag !== "Number") error("number expected", t.right);
            return { tag: "Number" };
        }
        case "var": {
            if (!(t.name in tyEnv)) error(`unknown variable: ${t.name}`, t);
            return tyEnv[t.name];
        }
        case "func": {
            const newTyEnv = { ...tyEnv };
            for (const { name, type } of t.params) {
                newTyEnv[name] = type;
            }
            const retType = typecheck(t.body, newTyEnv, tyVars);
            return { tag: "Func", params: t.params, retType };
        }
        case "call": {
            const funcTy = typecheck(t.func, tyEnv, tyVars);
            if (funcTy.tag !== "Func") error("function expected", t.func);
            if (t.args.length !== funcTy.params.length) {
                error("wrong number of arguments", t);
            }
            for (let i = 0; i < t.args.length; i++) {
                const argTy = typecheck(t.args[i], tyEnv, tyVars);
                if (!typeEq(argTy, funcTy.params[i].type, tyVars)) {
                    error(
                        `parameter type mismatch: [${i}]: expected ${
                            funcTy.params[i].type.tag
                        }, got ${argTy.tag}`,
                        t.args[i],
                    );
                }
            }
            return funcTy.retType;
        }
        case "seq": {
            typecheck(t.body, tyEnv, tyVars);
            return typecheck(t.rest, tyEnv, tyVars);
        }
        case "const": {
            const ty = typecheck(t.init, tyEnv, tyVars);
            const newTyEnv = { ...tyEnv, [t.name]: ty };
            return typecheck(t.rest, newTyEnv, tyVars);
        }
        case "typeAbs": {
            const tyVars2 = [...tyVars];
            for (const tyVar of t.typeParams) tyVars2.push(tyVar);
            const bodyTy = typecheck(t.body, tyEnv, tyVars2);
            return { tag: "TypeAbs", typeParams: t.typeParams, type: bodyTy };
        }
        case "typeApp": {
            const bodyTy = typecheck(t.typeAbs, tyEnv, tyVars);
            if (bodyTy.tag !== "TypeAbs") {
                error("type abstraction expected", t.typeAbs);
            }
            if (bodyTy.typeParams.length !== t.typeArgs.length) {
                error(
                    "wrong number of type arguments",
                    t,
                );
            }
            let newTy = bodyTy.type;
            for (let i = 0; i < bodyTy.typeParams.length; i++) {
                newTy = subst(newTy, bodyTy.typeParams[i], t.typeArgs[i]);
            }
            return newTy;
        }
    }
}

let freshTyVarId = 1;

function fresthTypeAbs(
    typeParams: string[],
    ty: Type,
): { newTypeParams: string[]; newType: Type } {
    let newType = ty;
    const newTypeParams = [];
    for (const tyVar of typeParams) {
        const newTyVar = `${tyVar}${freshTyVarId++}`;
        newType = subst(newType, tyVar, { tag: "TypeVar", name: newTyVar });
        newTypeParams.push(newTyVar);
    }
    return { newTypeParams, newType };
}

function subst(ty: Type, tyVarName: string, repTy: Type): Type {
    switch (ty.tag) {
        case "Boolean": // fallthrough
        case "Number":
            return ty;
        case "Func": {
            const params = ty.params.map(({ name, type }) => ({
                name,
                type: subst(type, tyVarName, repTy),
            }));
            const retType = subst(ty.retType, tyVarName, repTy);
            return { tag: "Func", params, retType };
        }
        case "TypeAbs": {
            if (ty.typeParams.includes(tyVarName)) return ty;
            const { newTypeParams, newType } = fresthTypeAbs(
                ty.typeParams,
                ty.type,
            );
            return {
                tag: "TypeAbs",
                typeParams: newTypeParams,
                type: subst(newType, tyVarName, repTy),
            };
        }
        case "TypeVar": {
            return ty.name === tyVarName ? repTy : ty;
        }
    }
}

function typeEqSub(ty1: Type, ty2: Type, map: Record<string, string>): boolean {
    switch (ty2.tag) {
        case "Boolean":
            return ty1.tag === "Boolean";
        case "Number":
            return ty1.tag === "Number";
        case "Func": {
            if (ty1.tag !== "Func") return false;
            if (ty1.params.length !== ty2.params.length) return false;
            for (let i = 0; i < ty1.params.length; i++) {
                // 仮引数の name の一致は確認しない
                if (!typeEqSub(ty1.params[i].type, ty2.params[i].type, map)) {
                    return false;
                }
            }
            return typeEqSub(ty1.retType, ty2.retType, map);
        }
        case "TypeAbs": {
            if (ty1.tag !== "TypeAbs") return false;
            if (ty1.typeParams.length !== ty2.typeParams.length) return false;
            const newMap = { ...map };
            for (let i = 0; i < ty1.typeParams.length; i++) {
                const typeParam1 = ty1.typeParams[i];
                const typeParam2 = ty2.typeParams[i];
                newMap[typeParam1] = typeParam2;
            }
            return typeEqSub(ty1.type, ty2.type, newMap);
        }
        case "TypeVar": {
            if (ty1.tag !== "TypeVar") return false;
            if (map[ty1.name] === undefined) {
                throw new Error(`unknown type variable: ${ty1.name}`);
            }
            return map[ty1.name] === ty2.name;
        }
    }
}

function typeEq(ty1: Type, ty2: Type, tyVars: string[]): boolean {
    const map: Record<string, string> = {};
    for (const tyVar of tyVars) map[tyVar] = tyVar;
    return typeEqSub(ty1, ty2, map);
}

function main() {
    console.log(
        typeShow(
            typecheck(
                parsePoly(`<T>(x: T) => true;`),
                {},
                [],
            ),
        ),
    );
    // => <T>(x: T) => boolean

    console.log(
        typeShow(
            typecheck(
                parsePoly(`
                    const f = (g: <T>(x: T) => boolean) => true;
                    const g = <T>(x: T) => true;
                    f(g);
                `),
                {},
                [],
            ),
        ),
    );
    // => boolean

    console.log(
        typeShow(
            typecheck(
                parsePoly(`
                    const f = <T>(x: T) => x;
                    f<number>;
                `),
                {},
                [],
            ),
        ),
    );
    // => (x: number) => number

    console.log(
        typeShow(
            typecheck(
                parsePoly(`
                    const f = <T>(g: (x: T) => T) => true;
                    f<number>;
                `),
                {},
                [],
            ),
        ),
    );
    // => (g: (x: number) => number) => boolean

    console.log(
        typeShow(
            typecheck(
                parsePoly(`
                    const f = <T>(arg1: T, arg2: <T>(x: T) => boolean) => true;
                    f<number>;
                `),
                {},
                [],
            ),
        ),
    );
    // => (arg1: number, arg2: <T>(x: T) => boolean) => boolean

    console.log(
        typeShow(
            typecheck(
                parsePoly(`
                    const f = <T>(arg1: T, arg2: <U>(x: T, y: U) => boolean) => true;
                    const bar = <U>() => f<U>;
                `),
                {},
                [],
            ),
        ),
    );
    // => <U>() => (arg1: U, arg2: <U1>(x: U, y: U1) => boolean) => boolean

    console.log(
        typeShow(
            typecheck(
                parsePoly(`
                    const select = <T>(cond: boolean, x: T, y: T) => cond ? x : y;
                `),
                {},
                [],
            ),
        ),
    );
    // => <T>(cond: boolean, x: T, y: T) => T
}

main();
