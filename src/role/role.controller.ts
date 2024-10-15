import { Controller, Post, Body } from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto } from '../dto/role.dto';

@Controller('roles')
export class RoleController {
  constructor(private roleService: RoleService) {}

  @Post()
  async create(@Body() createRoleDto: CreateRoleDto) {
    return this.roleService.create(createRoleDto);
  }
}
