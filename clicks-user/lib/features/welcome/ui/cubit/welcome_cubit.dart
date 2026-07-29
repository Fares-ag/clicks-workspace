import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart' show kDebugMode;

import '../../logic/services/welcome_service.dart';

part 'welcome_state.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print(msg);
  }
}

class WelcomeCubit extends Cubit<WelcomeState> {
  WelcomeCubit() : super(WelcomeInitial());

  void getPosition() async {
    emit(WelcomeLoading());
    try {
      await WelcomeService.determinePosition();
      emit(WelcomeSuccess());
    } catch (e) {
      _log('📍 Location error: $e');
      emit(WelcomeError("Error in getting Location, please try again"));
    }
  }
}
