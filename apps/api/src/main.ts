import "reflect-metadata";
import {NestFactory} from "@nestjs/core";
import {Body,Controller,Get,Module,Post} from "@nestjs/common";
import {MarketingRequestSchema} from "@medsol/contracts";

@Controller()
class AppController {
  @Get("health") health(){return {status:"ok",service:"medsol-ai-marketing-api"}}
  @Post("marketing/requests") assess(@Body() body:unknown){
    const request=MarketingRequestSchema.parse(body);
    return {status:"ASSESSED",traceId:crypto.randomUUID(),request,nextStep:"CAMPAIGN_PROPOSAL"};
  }
}
@Module({controllers:[AppController]}) class AppModule {}
async function bootstrap(){const app=await NestFactory.create(AppModule);app.enableCors();await app.listen(Number(process.env.PORT??3001));}
bootstrap();