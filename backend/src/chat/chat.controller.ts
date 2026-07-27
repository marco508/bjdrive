import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { IsString, MaxLength, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { CurrentUser } from '../common/decorators'
import { ChatService } from './chat.service'

class SendMessageDto {
  @IsString() @MinLength(1) @MaxLength(1000) body: string
}

@Controller('orders/:orderId/messages')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chat: ChatService) {}

  @Get()
  list(@CurrentUser() user: any, @Param('orderId') orderId: string) {
    return this.chat.list(user.userId, user.role, orderId)
  }

  @Post()
  send(@CurrentUser() user: any, @Param('orderId') orderId: string, @Body() dto: SendMessageDto) {
    return this.chat.send(user.userId, user.role, orderId, dto.body)
  }
}
