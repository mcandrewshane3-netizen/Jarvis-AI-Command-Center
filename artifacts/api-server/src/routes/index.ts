import { Router, type IRouter } from "express";
import healthRouter from "./health";
import jarvisRouter from "./jarvis";
import specialistsRouter from "./specialists";

const router: IRouter = Router();

router.use(healthRouter);
router.use(jarvisRouter);
router.use(specialistsRouter);

export default router;
