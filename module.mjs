// @ts-check
import { appRoot } from "@prisma/composer";
import webRuntimeService from "./service.mjs";

export default appRoot("myapp", ({ provision }) => {
  provision(webRuntimeService, { id: "webruntime" });
});
