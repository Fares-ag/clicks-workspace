import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/home/ui/view/active_job_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

/// Opens the map-first active job flow as a pushed route (not the Home tab).
Future<void> openActiveJobScreen(BuildContext context, HomeCubit cubit) {
  return Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => BlocProvider.value(
        value: cubit,
        child: ActiveJobScreen(cubit: cubit),
      ),
    ),
  );
}
