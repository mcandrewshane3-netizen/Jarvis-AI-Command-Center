import { Router, type IRouter } from "express";
import healthRouter from "./health";
import jarvisRouter from "./jarvis";
import specialistsRouter from "./specialists";
import economicEngineRouter from "./economic-engine";

const router: IRouter = Router();

router.use(healthRouter);
router.use(jarvisRouter);
router.use(specialistsRouter);
router.use(economicEngineRouter);

export default router;
