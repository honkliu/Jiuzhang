import React from 'react';
import { Avatar, AvatarProps } from '@mui/material';
import { Male as MaleIcon, Female as FemaleIcon, Person as PersonIcon } from '@mui/icons-material';

export type Gender = 'male' | 'female';

export interface UserAvatarProps extends Omit<AvatarProps, 'children'> {
  src?: string;
  gender?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ src, gender, ...props }) => {
  const normalized = (gender || '').toLowerCase();
  const icon = normalized === 'female' ? <FemaleIcon fontSize="small" /> : normalized === 'male' ? <MaleIcon fontSize="small" /> : <PersonIcon fontSize="small" />;

  return (
    <Avatar src={src || undefined} {...props}>
      {icon}
    </Avatar>
  );
};
