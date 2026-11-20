import test from "node:test";
import assert from "node:assert/strict";
import { MAX_VAULT_FILE_BYTES, validateVaultFile } from "../src/utils/vaultValidation.js";
test("vault allows supported document formats within 5 MiB",()=>{for(const name of ["file.pdf","file.docx","file.xlsx"])assert.equal(validateVaultFile({name,size:MAX_VAULT_FILE_BYTES,type:""}).valid,true);});
test("vault rejects oversized and unsupported uploads",()=>{assert.equal(validateVaultFile({name:"a.pdf",size:MAX_VAULT_FILE_BYTES+1,type:"application/pdf"}).valid,false);assert.equal(validateVaultFile({name:"script.exe",size:20,type:"application/octet-stream"}).valid,false);assert.equal(validateVaultFile(null).valid,false);});
test("vault accepts type when extension is unusual but MIME matches",()=>{assert.equal(validateVaultFile({name:"odd.bin",size:10,type:"application/pdf"}).valid,true);});
