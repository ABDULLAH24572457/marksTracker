import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtGuard } from './guards/jwt.guard';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getCurrentUser(user.id);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('test/admin')
  adminOnly(@CurrentUser() user: AuthenticatedUser) {
    return {
      message: 'Admin access granted.',
      user,
    };
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(Role.DATA_ENTRY)
  @Get('test/data-entry')
  dataEntryOnly(@CurrentUser() user: AuthenticatedUser) {
    return {
      message: 'Data-entry access granted.',
      user,
    };
  }
}
